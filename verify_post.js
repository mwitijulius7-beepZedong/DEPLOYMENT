const http = require('http');

http.get('http://localhost:3000/api/posts', (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    try {
      const parsed = JSON.parse(data);
      const post = parsed.posts.find(p => p.title === "The Art of Slow Living in Nairobi");
      if (post) {
        console.log("POST_FOUND");
        console.log("Title:", post.title);
        console.log("Subtitle:", post.subtitle);
        console.log("Pull Quote:", post.pullQuote);
        console.log("Scene Card:", post.sceneCard);
        console.log("Closing Box:", post.closingBox);
        console.log("Content Preview:", post.content.substring(0, 100));
      } else {
        console.log("POST_NOT_FOUND");
        console.log("Available titles:", parsed.posts.map(p => p.title).join(', '));
      }
    } catch (e) {
      console.log("PARSE_ERROR", e.message);
      console.log("Raw Data:", data.substring(0, 500));
    }
  });
}).on("error", (err) => {
  console.log("FETCH_ERROR", err.message);
});
