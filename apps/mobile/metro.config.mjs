import { getDefaultConfig } from 'expo/metro-config.js';
import { fileURLToPath } from 'url';

const projectRoot = fileURLToPath(new URL('.', import.meta.url)).replace(/[\\/]+$/, '');
const config = getDefaultConfig(projectRoot);

export default config;
