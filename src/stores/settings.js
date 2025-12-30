// settings.js
export async function saveThemeSettings(primaryColor, accentColor) {
  return fetch('/api/settings/theme', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ primaryColor, accentColor })
  });
}

export async function saveBlogInfo(title, description) {
  return fetch('/api/settings/blog-info', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ blogTitle: title, blogDescription: description })
  });
}

export async function saveBackground(backgroundUrl) {
  return fetch('/api/settings/background', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ backgroundUrl })
  });
}
