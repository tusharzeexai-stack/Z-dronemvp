# AWS Deployment Guide - Z-DRONE Fleet Management

This guide explains how to host and deploy the Z-DRONE frontend application on Amazon Web Services (AWS). Since the project is a React single-page application (SPA) built with Vite, the static build output (`dist/` folder) should be hosted serverlessly using S3 and cached globally using CloudFront.

---

## Deployment Options

### Option 1: AWS Amplify (Recommended & Easiest)
AWS Amplify Console connects directly to your GitHub repository and automatically deploys your site on every push (just like Vercel). It handles SSL, custom domains, and redirects automatically.

#### Setup Steps:
1. Log in to the [AWS Management Console](https://console.aws.aws.com/).
2. Navigate to **AWS Amplify**.
3. Click **Create New App** -> **Host web app**.
4. Select **GitHub** as the provider, authorize AWS, and select the `Z-dronemvp` repository and `main` branch.
5. In the Build settings, Amplify will auto-detect the framework. Ensure the build configuration is:
   ```yaml
   version: 1
   frontend:
     phases:
       preBuild:
         commands:
           - npm ci
       build:
         commands:
           - npm run build
     artifacts:
       baseDirectory: dist
       files:
         - '**/*'
     cache:
       paths:
         - node_modules/**/*
   ```
6. Click **Save and Deploy**.
7. **Important (SPA Redirects)**: In the left sidebar of your Amplify app, navigate to **Rewrites and redirects** and add a rule to forward all unrecognized requests to `index.html` (crucial for React routing):
   - **Source address**: `</^[^.]+$|\.(?!(css|gif|ico|jpg|js|png|txt|svg|woff|woff2|ttf|map|json|webp|mp4)$)([^.]+$)/>`
   - **Target address**: `/index.html`
   - **Type**: `200 (Rewrite)`

---

### Option 2: Automated Terraform (S3 + CloudFront)
For programmatic infrastructure management, we have provided a Terraform configuration inside the `/terraform` folder. This provisions a secure S3 bucket with CloudFront Origin Access Control (OAC), keeping the S3 bucket private and exposing the site only through CloudFront with SSL.

#### Setup Steps:
1. Install [Terraform](https://www.terraform.io/downloads.html).
2. Configure your AWS credentials (`aws configure`).
3. Navigate to `/terraform` and run:
   ```bash
   terraform init
   terraform plan
   terraform apply
   ```
4. The output will provide the `cloudfront_domain_name`. Open it in your browser to view your app.
5. Deploy your build files using the **Node.js Deployment Script** (Option 3).

---

### Option 3: Node.js Local Deployment Script
We have provided a automated local deploy script (`scripts/deploy-aws.js`) that runs the build, uploads assets to S3, and invalidates the CloudFront cache.

#### Prerequisites:
1. AWS CLI installed and configured with appropriate permissions (S3 put/delete, CloudFront invalidation):
   ```bash
   aws configure
   ```
2. Install the AWS SDK dependencies:
   ```bash
   npm install @aws-sdk/client-s3 @aws-sdk/client-cloudfront mime-types
   ```

#### Usage:
Run the script to build and deploy to S3 in one command:
```bash
npm run deploy:aws -- --bucket=YOUR_S3_BUCKET_NAME --dist=YOUR_CLOUDFRONT_DISTRIBUTION_ID
```
*(If you deploy using Terraform, these values will be printed to your terminal after running `terraform apply`)*.
