import { state } from './state.js';

export function initTheme() {
    const applyTheme = (theme) => {
        if (theme === 'dark') {
            document.documentElement.classList.add('dark');
            document.documentElement.classList.remove('light');
        } else {
            document.documentElement.classList.add('light');
            document.documentElement.classList.remove('dark');
        }
    };

    // Initialize theme based on current state
    applyTheme(state.settings.theme);

    // Watch for updates
    state.subscribe((updatedState) => {
        applyTheme(updatedState.settings.theme);
    });
}
