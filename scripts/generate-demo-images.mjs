import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const outputDir = path.resolve(process.cwd(), 'public', 'demo');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

const items = [
  { id: 'pothole-1', category: 'POTHOLE', title: 'Deep Crater on Bus Stand Road', bg: '#2b2b2b', accent: '#e8590c' },
  { id: 'pothole-2', category: 'POTHOLE', title: 'Road Edge Depression &amp; Asphalt Break', bg: '#333333', accent: '#e8590c' },
  { id: 'pothole-3', category: 'POTHOLE', title: 'Surface Trench along SV University Lane', bg: '#262626', accent: '#e8590c' },
  { id: 'streetlight-1', category: 'STREETLIGHT', title: 'Dark Luminaire at Renigunta Pole 42', bg: '#172230', accent: '#fbbf24' },
  { id: 'streetlight-2', category: 'STREETLIGHT', title: 'Exposed Wiring at Gandhi Road Lamp', bg: '#1c2836', accent: '#fbbf24' },
  { id: 'streetlight-3', category: 'STREETLIGHT', title: 'Damaged Fixture near Station Roundabout', bg: '#151e28', accent: '#fbbf24' },
  { id: 'garbage-1', category: 'GARBAGE', title: 'Overflowing Municipal Bin at Alipiri Gate', bg: '#1c2e26', accent: '#4ade80' },
  { id: 'garbage-2', category: 'GARBAGE', title: 'Commercial Waste Dumping along Korlagunta', bg: '#21332a', accent: '#4ade80' },
  { id: 'garbage-3', category: 'GARBAGE', title: 'Green Waste Pile blocking Pedestrian Path', bg: '#17241e', accent: '#4ade80' },
  { id: 'water-1', category: 'WATER LEAK', title: 'High Pressure Main Pipe Burst at Junction', bg: '#16283b', accent: '#60a5fa' },
  { id: 'water-2', category: 'WATER LEAK', title: 'Valve Seepage Flooding Service Road', bg: '#1b324a', accent: '#60a5fa' },
  { id: 'water-3', category: 'WATER LEAK', title: 'Drain Backflow pooling near Market entrance', bg: '#142231', accent: '#60a5fa' },
];

async function generate() {
  for (const item of items) {
    const svg = `
    <svg width="800" height="600" viewBox="0 0 800 600" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="g_${item.id}" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${item.bg}"/>
          <stop offset="100%" stop-color="#0b1118"/>
        </linearGradient>
        <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="1"/>
        </pattern>
      </defs>
      <rect width="800" height="600" fill="url(#g_${item.id})"/>
      <rect width="800" height="600" fill="url(#grid)"/>

      <!-- Accent Top Banner -->
      <rect x="0" y="0" width="800" height="8" fill="${item.accent}"/>

      <!-- Category Chip -->
      <rect x="50" y="60" width="160" height="36" rx="6" fill="${item.accent}" fill-opacity="0.18" stroke="${item.accent}" stroke-width="1.5"/>
      <text x="130" y="83" font-family="system-ui, sans-serif" font-size="14" font-weight="700" fill="${item.accent}" text-anchor="middle" letter-spacing="1.5">${item.category}</text>

      <!-- Location Badge -->
      <rect x="225" y="60" width="220" height="36" rx="6" fill="#233140" fill-opacity="0.8" stroke="#334155" stroke-width="1"/>
      <text x="335" y="83" font-family="system-ui, sans-serif" font-size="13" font-weight="500" fill="#93a4b4" text-anchor="middle">Tirupati Verified GPS</text>

      <!-- Visual Symbol Placeholder -->
      <circle cx="400" cy="280" r="100" fill="${item.accent}" fill-opacity="0.1" stroke="${item.accent}" stroke-width="2" stroke-dasharray="6,4"/>
      <circle cx="400" cy="280" r="40" fill="${item.accent}" fill-opacity="0.3"/>
      
      <!-- Crosshairs -->
      <line x1="260" y1="280" x2="540" y2="280" stroke="${item.accent}" stroke-opacity="0.3" stroke-width="1.5"/>
      <line x1="400" y1="140" x2="400" y2="420" stroke="${item.accent}" stroke-opacity="0.3" stroke-width="1.5"/>

      <!-- Title & Coordinates text -->
      <text x="50" y="480" font-family="system-ui, sans-serif" font-size="24" font-weight="700" fill="#ffffff">${item.title}</text>
      <text x="50" y="520" font-family="ui-monospace, monospace" font-size="15" fill="#93a4b4">GPS: 13.6288° N, 79.4192° E ± 4.2m · Field Sensor Locked</text>
      <text x="50" y="550" font-family="ui-monospace, monospace" font-size="13" fill="#52606d">ResponSys Civic Capture System · Hash Verified · Tamper Resistant</text>
    </svg>
    `;

    const filePath = path.join(outputDir, `${item.id}.jpg`);
    await sharp(Buffer.from(svg))
      .jpeg({ quality: 85 })
      .toFile(filePath);
    console.log(`Generated demo image: ${filePath}`);
  }
}

generate().catch(err => {
  console.error(err);
  process.exit(1);
});
