const { execSync } = require('child_process');

console.log('[build] Running Nest build with increased memory...');
execSync('npx nest build', {
  stdio: 'inherit',
  env: {
    ...process.env,
    NODE_OPTIONS: '--max-old-space-size=4096',
  },
});
