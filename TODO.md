# TODO: Enable Viewing Admin Entry Key

## Current Task: Add View/Clear Functionality for Admin Entry Key

### Steps to Complete:
- [ ] Add "View Current Key" button to Security Settings section in admin.html
- [ ] Add "Clear Key" button to Security Settings section in admin.html
- [ ] Implement `viewCurrentKey()` JavaScript function to prompt for password and fetch key
- [ ] Implement `clearKey()` JavaScript function to clear the key input and save
- [ ] Test the functionality in the admin panel

### Notes:
- Server endpoint `/api/settings/security/key-view` requires POST with username and password
- View function should display key in alert after successful authentication
- Clear function should reset input to empty and save settings
