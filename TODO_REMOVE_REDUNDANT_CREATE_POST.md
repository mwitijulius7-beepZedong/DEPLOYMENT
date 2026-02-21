# TODO: Remove Redundant Create Post Functions

## Task: Remove redundant create post buttons and keep only the one in the sidebar

### Files to Edit:

1. **admin.html**
   - Remove the "Create New Post" button in the posts-section (line with `onclick="createNewPost()"`)
   - Keep the sidebar link that uses `showCreatePostSection()`

### Changes:
- [x] Edit admin.html to remove redundant create post button in posts-section
- [x] Edit server.js to fix settings loading issue (settings not persisting after page refresh)

## Additional Fix Applied:

The user's feedback indicated that general settings (like phone number) were not showing after page refresh even though they were saved. The root cause was in the `/api/settings/author` GET endpoint in server.js.

**Problem:** The endpoint was returning empty values when MongoDB was available but didn't have the author data, instead of falling back to the local settings.json file.

**Solution:** Updated the endpoint to check if MongoDB has valid author data before using it, and properly fall back to the local settings.json file when MongoDB returns empty data.

The fix ensures that:
- Settings saved in settings.json are properly loaded
- The phone number, WhatsApp, and other author fields will now display correctly after page refresh
- Both blog-info and author settings are properly retrieved and displayed
