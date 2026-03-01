const fs = require('fs');
const path = require('path');

const filePath = path.join('d:', 'DEPLOYMENT', 'admin.html');
let html = fs.readFileSync(filePath, 'utf8');

// Fix 1: Form labels
// We are looking for <label class="form-label">Text</label>\s*<input/select/textarea ... id="some-id"
const labelRegex = /<label class="form-label">([^<]+)<\/label>\s*(?:<div [^>]*>\s*)*(<input|<select|<textarea)[^>]*?id="([^"]+)"/g;

html = html.replace(labelRegex, (match, labelText, tag, id) => {
    // Inject the for attribute into the label
    const newLabel = `<label for="${id}" class="form-label">${labelText}</label>`;
    // Since we matched the label and everything up to the id, we need to reconstruct the original string but with the modified label
    // Wait, let's just use string replace on the match
    return match.replace(/<label class="form-label">([^<]+)<\/label>/, newLabel);
});

// Also fix the color labels
const colorLabelRegex = /<label class="form-label">([^<]+)<\/label>\s*<div class="color-input-group">\s*<input[^>]*?id="([^"]+)"/g;
html = html.replace(colorLabelRegex, (match, labelText, id) => {
    return match.replace(/<label class="form-label">([^<]+)<\/label>/, `<label for="${id}" class="form-label">${labelText}</label>`);
});

// Admin Key label
const adminKeyLabelRegex = /<label class="form-label">Admin Entry Key<\/label>\s*<div style="position: relative;">\s*<input[^>]*?id="([^"]+)"/g;
html = html.replace(adminKeyLabelRegex, (match, id) => {
    return match.replace(/<label class="form-label">Admin Entry Key<\/label>/, `<label for="${id}" class="form-label">Admin Entry Key</label>`);
});

// Fix 2: Heading hierarchy
html = html.replace(/.sidebar-logo h2/g, '.sidebar-logo .sidebar-logo-title');
html = html.replace(/<h2>zedong254ke<\/h2>/g, '<span class="sidebar-logo-title">zedong254ke</span>');

// Fix 3: Missing ARIA labels
html = html.replace(/<button class="sidebar-toggle" onclick="toggleSidebar\(\)">/g, '<button class="sidebar-toggle" onclick="toggleSidebar()" aria-label="Toggle sidebar">');
html = html.replace(/<button type="button" id="admin-key-toggle" class="password-toggle"/g, '<button type="button" id="admin-key-toggle" class="password-toggle" aria-label="Toggle admin key visibility"');

fs.writeFileSync(filePath, html);
console.log('Fixed accessibility issues in admin.html');
