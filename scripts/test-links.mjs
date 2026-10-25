import { parseLinks } from '../lib/links.js';
const s='https://youtu.be/plN7JMbadRg?si=5M2idfhGCeE-b7L1https://youtu.be/RE3_PGwDwhw?si=9fUNdzakNkkx0m6Uhttps://youtu.be/RE3_PGwDwhw?si=qmJ7khiIz5C9cr6Ohttps://youtu.be/PZNsBGjNH0U?si=ETaqmqrx5nHyFKZbhttps://youtu.be/MebGKTC2uig?si=RVumX4BYciMP9oVShttps://youtu.be/hEW2GMxxxjQ?si=Jyca1p1Diyb2umDXhttps://youtu.be/nLqURtIaa1A?si=D5IXfQT8URVLyQ4xhttps://www.youtube.com/live/tXH5EjM_96c?si=Mjo2bqNJQUfvFSqThttps://www.youtube.com/live/wLb8B2gUO6E?si=FHcq0AauoK0jTAZM';
const r=parseLinks(s); console.log(r);
console.assert(r.links.length===8 && r.duplicates===1, 'concat');
console.log(parseLinks('https://www.youtube.com/watch?v=dQw4w9WgXcQ'));
console.log(parseLinks('a https://x.com/v/1, https://youtu.be/dQw4w9WgXcQ?is=abc\nhttps://youtu.be/dQw4w9WgXcQ'));
const many=Array.from({length:12},(_,i)=>`https://example.com/v${i}`).join(''); console.log(parseLinks(many).links.length, parseLinks(many).dropped);
