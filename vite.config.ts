import { defineConfig } from 'vite';
export default defineConfig({
  base:'./',
  build:{
    outDir:'.artifacts/trial/dist',
    rolldownOptions:{output:{codeSplitting:{groups:[
      {name:'phaser',test:/node_modules[\\/]phaser/},
      {name:'game-data',test:/src[\\/]data[\\/].*\.json$/},
    ]}}},
  },
  server:{host:'127.0.0.1'},
});
