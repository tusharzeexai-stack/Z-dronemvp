import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { CloudFrontClient, CreateInvalidationCommand } from '@aws-sdk/client-cloudfront';
import mime from 'mime-types';

async function main() {
  const args = process.argv.slice(2);
  const getArg = (name) => {
    const match = args.find(a => a.startsWith(`--${name}=`));
    return match ? match.split('=')[1] : null;
  };

  const bucket = getArg('bucket') || process.env.AWS_S3_BUCKET;
  const distId = getArg('dist') || process.env.AWS_CLOUDFRONT_DISTRIBUTION_ID;
  const region = getArg('region') || 'us-east-1';

  if (!bucket) {
    console.error('❌ Error: --bucket=<s3-bucket-name> parameter is required.');
    console.log('Usage: npm run deploy:aws -- --bucket=my-s3-bucket-name [--dist=my-cf-dist-id] [--region=us-east-1]');
    process.exit(1);
  }

  console.log('📦 1. Running production build...');
  try {
    execSync('npm run build', { stdio: 'inherit' });
  } catch (err) {
    console.error('❌ Build failed.');
    process.exit(1);
  }

  const s3 = new S3Client({ region });
  const distDir = path.resolve('dist');

  if (!fs.existsSync(distDir)) {
    console.error(`❌ Dist directory not found at ${distDir}`);
    process.exit(1);
  }

  console.log(`\n🚀 2. Uploading assets to S3 bucket: ${bucket}...`);
  const files = [];
  
  function walk(dir) {
    const items = fs.readdirSync(dir);
    for (const item of items) {
      const fullPath = path.join(dir, item);
      if (fs.statSync(fullPath).isDirectory()) {
        walk(fullPath);
      } else {
        files.push(fullPath);
      }
    }
  }
  
  walk(distDir);

  for (const file of files) {
    const relativePath = path.relative(distDir, file).replace(/\\/g, '/');
    const fileStream = fs.createReadStream(file);
    const contentType = mime.lookup(file) || 'application/octet-stream';

    console.log(`   Uploading ${relativePath} (${contentType})...`);
    
    const uploadParams = {
      Bucket: bucket,
      Key: relativePath,
      Body: fileStream,
      ContentType: contentType,
    };

    try {
      await s3.send(new PutObjectCommand(uploadParams));
    } catch (uploadErr) {
      console.error(`❌ Failed to upload ${relativePath}:`, uploadErr.message);
      process.exit(1);
    }
  }
  console.log('✅ Upload completed successfully!');

  if (distId) {
    console.log(`\n⚡ 3. Creating CloudFront Invalidation for distribution: ${distId}...`);
    const cf = new CloudFrontClient({ region });
    const invalidationParams = {
      DistributionId: distId,
      InvalidationBatch: {
        CallerReference: `deploy-aws-${Date.now()}`,
        Paths: {
          Quantity: 1,
          Items: ['/*'],
        },
      },
    };

    try {
      await cf.send(new CreateInvalidationCommand(invalidationParams));
      console.log('✅ CloudFront Cache Invalidation request created successfully!');
    } catch (cfErr) {
      console.warn('⚠️ Warning: Failed to invalidate CloudFront cache:', cfErr.message);
    }
  } else {
    console.log('\n💡 Tip: Provide --dist=<cloudfront-distribution-id> to automatically clear the CloudFront cache.');
  }

  console.log('\n🎉 AWS Deployment Finished Successfully!');
}

main().catch(err => {
  console.error('❌ Critical deployment error:', err);
  process.exit(1);
});
