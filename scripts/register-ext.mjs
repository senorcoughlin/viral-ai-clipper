import { register } from 'node:module';
register(new URL('./ext-hook.mjs', import.meta.url));
