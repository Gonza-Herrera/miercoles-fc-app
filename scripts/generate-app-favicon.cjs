// Wrap the generated PNG variants in an ICO container for browser fallback.
const fs = require('node:fs');
const sizes = [16, 32];
const images = sizes.map(size => fs.readFileSync(`public/icons/favicon-${size}.png`));
const header = Buffer.alloc(6 + sizes.length * 16);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
sizes.forEach((size, index) => {
  const entry = 6 + index * 16;
  header[entry] = size;
  header[entry + 1] = size;
  header.writeUInt16LE(1, entry + 4);
  header.writeUInt16LE(32, entry + 6);
  header.writeUInt32LE(images[index].length, entry + 8);
  header.writeUInt32LE(offset, entry + 12);
  offset += images[index].length;
});
fs.writeFileSync('public/favicon.ico', Buffer.concat([header, ...images]));
