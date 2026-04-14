const fs = require('fs');
const path = require('path');

const filePath = path.join(process.cwd(), 'apps', 'backend', 'lib', 'prisma.ts');
let content = fs.readFileSync(filePath, 'utf8');

// Replace new PrismaClient({ log: ... })
const logRegex = /new PrismaClient\(\{\n\s*log:[\s\S]*?\},\n\s*\}\);/;
const logReplacement = `new PrismaClient({
    log: [
      { emit: 'event', level: 'query' },
      { emit: 'event', level: 'error' },
      { emit: 'event', level: 'info' },
      { emit: 'event', level: 'warn' },
    ],
  });

// Setup Prisma logging events
if (process.env.NODE_ENV === "development") {
  prisma.$on("query" as any, (e: any) => {
    logger.debug(\`prisma:query \${e.query} [\${e.duration}ms]\`);
  });
  prisma.$on("error" as any, (e: any) => {
    logger.error(e.message);
  });
  prisma.$on("warn" as any, (e: any) => {
    logger.warn(e.message);
  });
  prisma.$on("info" as any, (e: any) => {
    logger.info(e.message);
  });
}`;

content = content.replace(logRegex, logReplacement);

fs.writeFileSync(filePath, content, 'utf8');
console.log('Prisma updated successfully');
