# TODO: Implement Profile Picture Display

## Steps to Complete
- [x] Add "profilePicture" field to author object in settings.json (initially empty string)
- [x] Verify server.js /api/settings/author endpoint includes profilePicture in response (should be automatic)
- [x] Update index.html header logo img to have an id for dynamic updating
- [x] Add JavaScript in index.html to fetch author settings on page load
- [x] Conditionally set profile picture src: use author.profilePicture if exists, else default DiceBear avatar
- [x] Test the implementation by loading index.html and verifying display

## Notes
- Profile picture will be fetched from database/API via /api/settings/author
- If profilePicture is empty or not set, show default avatar
- Default avatar: https://api.dicebear.com/7.x/avataaars/svg?seed=zedong
