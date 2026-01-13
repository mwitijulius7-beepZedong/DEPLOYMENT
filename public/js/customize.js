// Customize module
export function showCustomizeSection() {
    // Hide other sections
    const sections = ['dashboard', 'posts-section', 'settings-section', 'analytics-section', 'create-post-section'];
    sections.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });

    const customizeSection = document.getElementById('customize-section');
    customizeSection.style.display = 'block';
    customizeSection.scrollIntoView({ behavior: 'smooth' });
}

export function showPrimaryOkButton() {
    document.getElementById('primary-ok-btn').style.display = 'inline-block';
}

export function showAccentOkButton() {
    document.getElementById('accent-ok-btn').style.display = 'inline-block';
}

export function confirmPrimaryColor() {
    const primaryColor = document.getElementById('primary-color').value;
    alert(`Primary color selected: ${primaryColor}`);
    // Here you could add logic to preview the color or store it temporarily
    document.getElementById('primary-ok-btn').style.display = 'none';
}

export function confirmAccentColor() {
    const accentColor = document.getElementById('accent-color').value;
    alert(`Accent color selected: ${accentColor}`);
    // Here you could add logic to preview the color or store it temporarily
    document.getElementById('accent-ok-btn').style.display = 'none';
}

export async function saveThemeSettings() {
    const primaryColor = document.getElementById('primary-color').value;
    const accentColor = document.getElementById('accent-color').value;

    try {
        const response = await fetch('/api/settings/theme', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ primaryColor, accentColor })
        });

        if (response.ok) {
            alert('Theme settings saved successfully!');
        } else {
            alert('Failed to save theme settings.');
        }
    } catch (error) {
        console.error('Error saving theme settings:', error);
        alert('Error saving theme settings.');
    }
}

export async function saveBlogInfo() {
    const blogTitle = document.getElementById('blog-title').value;
    const blogDescription = document.getElementById('blog-description').value;

    try {
        const response = await fetch('/api/settings/blog-info', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ blogTitle, blogDescription })
        });

        if (response.ok) {
            alert('Blog information saved successfully!');
        } else {
            alert('Failed to save blog information.');
        }
    } catch (error) {
        console.error('Error saving blog information:', error);
        alert('Error saving blog information.');
    }
}

export async function handleBackgroundUpload() {
    const fileInput = document.getElementById('background-file');
    const file = fileInput.files[0];

    if (!file) {
        alert('Please select a file first.');
        return;
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
        alert('Please select a valid image file.');
        return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
        alert('File size must be less than 5MB.');
        return;
    }

    const formData = new FormData();
    formData.append('image', file);

    try {
        const response = await fetch('/api/upload', {
            method: 'POST',
            credentials: 'include',
            body: formData
        });

        if (response.ok) {
            const data = await response.json();
            // Set the uploaded URL in the background URL input
            document.getElementById('background-url').value = data.url;
            alert('Background image uploaded successfully!');
        } else {
            const errorData = await response.json();
            alert('Failed to upload background image: ' + (errorData.error || 'Unknown error'));
        }
    } catch (error) {
        console.error('Error uploading background image:', error);
        alert('Error uploading background image.');
    }
}

export async function saveBackgroundSettings() {
    const backgroundUrl = document.getElementById('background-url').value;

    if (!backgroundUrl) {
        alert('Please provide a background URL or upload an image first.');
        return;
    }

    try {
        const response = await fetch('/api/settings/background', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ backgroundUrl })
        });

        if (response.ok) {
            alert('Background settings saved successfully!');
        } else {
            const errorData = await response.json();
            alert('Failed to save background settings: ' + (errorData.error || 'Unknown error'));
        }
    } catch (error) {
        console.error('Error saving background settings:', error);
        alert('Error saving background settings.');
    }
}

export function previewChanges() {
    const primaryColor = document.getElementById('primary-color').value;
    const accentColor = document.getElementById('accent-color').value;

    // Temporarily apply colors for preview
    document.documentElement.style.setProperty('--primary-color', primaryColor);
    document.documentElement.style.setProperty('--accent-color', accentColor);

    alert('Preview applied! Click "Apply All Changes" to save permanently.');
}

export async function applyChanges() {
    // Save all settings
    await saveThemeSettings();
    await saveBlogInfo();
    await saveBackgroundSettings();

    alert('All changes applied successfully!');
}

export function previewColorBackground() {
    const color = document.getElementById('background-color').value;
    // Here you could add logic to preview the color background
    alert(`Color background selected: ${color}`);
}

export function applyColorBackground() {
    const color = document.getElementById('background-color').value;
    document.getElementById('background-url').value = color;
    alert(`Color background applied: ${color}`);
}

export function selectPattern(pattern) {
    // Here you could add logic to select predefined patterns
    alert(`Pattern selected: ${pattern}`);
}
