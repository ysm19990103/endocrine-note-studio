import {defineConfig} from 'playwright/test';
export default defineConfig({
 testDir:'tests/browser', timeout:30000, workers:1, retries:0,
 reporter:'list', use:{baseURL:'http://127.0.0.1:4173',headless:true,trace:'off',screenshot:'off',video:'off'},
 webServer:{command:'node tests/serve.mjs',url:'http://127.0.0.1:4173',reuseExistingServer:false},
});
