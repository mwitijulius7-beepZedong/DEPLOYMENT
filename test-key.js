const bcrypt = require('bcryptjs');

const hash = '$2a$10$uL.pfDWf2aF0L5N7bm1GIumR820O9TGvKXLBKjaMclvBKbFPpWksW';
const key1 = 'Mwitijulius7';
const key2 = 'Mwitijulius7@Jm';

bcrypt.compare(key1, hash).then(match => {
  console.log('Key1 matches hash:', match);
}).catch(err => console.error(err));

bcrypt.compare(key2, hash).then(match => {
  console.log('Key2 matches hash:', match);
}).catch(err => console.error(err));

// Generate hash for key2
bcrypt.hash(key2, 10).then(newHash => {
  console.log('New hash for key2:', newHash);
}).catch(err => console.error(err));
