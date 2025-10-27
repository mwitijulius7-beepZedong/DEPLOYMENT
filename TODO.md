# Fix Blog Post Persistence Issue

## Problem
New blog posts are disappearing because the frontend saves to localStorage while the server has its own posts.json. When localStorage is cleared or user switches devices, posts are lost.

## Solution
Make the frontend sync with the server API instead of localStorage.

## Steps
- [x] Modify loadData() to load posts from GET /api/posts instead of localStorage
- [x] Modify savePost() to use POST/PUT /api/posts for creating/updating posts
- [x] Remove localStorage saving for posts (saveData() calls)
- [x] Ensure authentication headers are used for API calls
- [x] Update deletePost() to use DELETE /api/posts/:id
- [x] Update likePost() and dislikePost() to use server API
- [x] Update addSamplePosts() to use server API
- [x] Test the fix by creating a new post and reloading the page
