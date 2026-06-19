// Micro-interactions for form submission
document.getElementById('loginForm').addEventListener('submit', function(e) {
    e.preventDefault();
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const btn = e.target.querySelector('button[type="submit"]');
    
    if (emailInput.value !== 'admin' || passwordInput.value !== 'Zeex@admin') {
        alert('Invalid credentials. Please use admin / Zeex@admin');
        return;
    }

    // Store user login info mock session
    localStorage.setItem('z_drone_user', JSON.stringify({
        email: emailInput.value,
        name: emailInput.value.includes('@') ? emailInput.value.split('@')[0].replace('.', ' ').replace(/\b\w/g, c => c.toUpperCase()) : 'Admin',
        role: 'Fleet Manager',
        loggedInAt: new Date().toISOString()
    }));

    btn.disabled = true;
    btn.innerHTML = `
        <svg class="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <span>Authenticating...</span>
    `;
    
    // Artificial delay to show premium loading state
    setTimeout(() => {
        btn.innerHTML = `
            <span class="material-symbols-outlined">check_circle</span>
            <span>Success</span>
        `;
        // Replace styles to match emerald color system
        btn.classList.remove('bg-primary', 'hover:bg-primary/95');
        btn.classList.add('bg-emerald-500', 'hover:bg-emerald-600');
        
        // Final "entering" animation
        setTimeout(() => {
            document.body.style.opacity = '0';
            document.body.style.transition = 'opacity 0.5s ease';
            setTimeout(() => {
                window.location.href = '/dashboard.html';
            }, 500);
        }, 800);
    }, 1200);
});

// Google login simulation
document.getElementById('googleLoginBtn').addEventListener('click', function(e) {
    e.preventDefault();
    const btn = this;
    
    localStorage.setItem('z_drone_user', JSON.stringify({
        email: 'alex.rivera@gmail.com',
        name: 'Alex Rivera',
        role: 'Fleet Manager',
        loggedInAt: new Date().toISOString()
    }));

    btn.disabled = true;
    btn.innerHTML = `
        <svg class="animate-spin h-5 w-5 text-slate-700" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <span class="ml-2 font-label-md text-label-md text-on-surface">Connecting to Google...</span>
    `;

    setTimeout(() => {
        btn.classList.add('border-emerald-500', 'bg-emerald-50');
        btn.innerHTML = `
            <span class="material-symbols-outlined text-emerald-600">check_circle</span>
            <span class="font-label-md text-label-md text-emerald-600">Google Verified</span>
        `;
        
        setTimeout(() => {
            document.body.style.opacity = '0';
            document.body.style.transition = 'opacity 0.5s ease';
            setTimeout(() => {
                window.location.href = '/dashboard.html';
            }, 500);
        }, 800);
    }, 1200);
});

// Background parallax effect on mouse move
document.addEventListener('mousemove', (e) => {
    const moveX = (e.clientX - window.innerWidth / 2) * 0.01;
    const moveY = (e.clientY - window.innerHeight / 2) * 0.01;
    const drone = document.querySelector('.drone-float');
    if (drone) {
        drone.style.transform = `translate(${moveX}px, ${moveY}px)`;
    }
});
