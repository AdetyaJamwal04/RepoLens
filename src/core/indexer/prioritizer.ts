import { GitTreeItem, RepoMetadata } from '../github/client';

export const EXCLUDED_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'out',
  'target',
  'vendor',
  '.idea',
  '.vscode',
  'coverage',
  '__pycache__',
  '.next',
  '.nuxt',
]);

export const BINARY_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.ico',
  '.svg',
  '.mp4',
  '.webm',
  '.mp3',
  '.wav',
  '.zip',
  '.tar',
  '.gz',
  '.pdf',
  '.wasm',
  '.exe',
  '.dll',
  '.so',
  '.dylib',
  '.woff',
  '.woff2',
  '.ttf',
  '.eot',
]);

export const LOCKFILES = new Set([
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'cargo.lock',
  'poetry.lock',
  'composer.lock',
  'gemfile.lock',
]);

const SECRET_EXTENSIONS = new Set(['.pem', '.key', '.p12', '.pfx']);
const SECRET_FILENAMES = new Set(['id_rsa', '.npmrc', '.pypirc', 'credentials.json']);

export const MANIFEST_FILES = new Set([
  'package.json',
  'pyproject.toml',
  'requirements.txt',
  'setup.py',
  'cargo.toml',
  'go.mod',
  'pom.xml',
  'build.gradle',
  'gemfile',
  'composer.json',
  'dockerfile',
  'docker-compose.yml',
  'docker-compose.yaml',
  'tsconfig.json',
]);

export const CONFIG_FILES = new Set([
  'tsconfig.json',
  'dockerfile',
  'docker-compose.yml',
  'docker-compose.yaml',
  '.env.example',
]);

export const README_FILES = new Set([
  'readme.md',
  'readme',
  'readme.markdown',
  'readme.txt',
]);

const ENTRY_PREFIXES = ['index.', 'main.', 'app.', 'server.', 'cli.', 'lib.'];

const EXTENSION_LANGUAGE_MAP: Record<string, string> = {
  '.ts': 'TypeScript',
  '.tsx': 'TypeScript',
  '.mts': 'TypeScript',
  '.cts': 'TypeScript',
  '.js': 'JavaScript',
  '.jsx': 'JavaScript',
  '.mjs': 'JavaScript',
  '.cjs': 'JavaScript',
  '.py': 'Python',
  '.rs': 'Rust',
  '.go': 'Go',
  '.java': 'Java',
  '.rb': 'Ruby',
  '.php': 'PHP',
};

const MANIFEST_LANGUAGE_MAP: Record<string, string[]> = {
  'package.json': ['JavaScript'],
  'tsconfig.json': ['TypeScript'],
  'pyproject.toml': ['Python'],
  'requirements.txt': ['Python'],
  'setup.py': ['Python'],
  'cargo.toml': ['Rust'],
  'go.mod': ['Go'],
  'pom.xml': ['Java'],
  'build.gradle': ['Java'],
  'gemfile': ['Ruby'],
  'composer.json': ['PHP'],
  'dockerfile': ['Docker'],
  'docker-compose.yml': ['Docker'],
  'docker-compose.yaml': ['Docker'],
};

export function isExcluded(path: string, type?: 'blob' | 'tree'): boolean {
  const normalized = path.replace(/\\/g, '/').replace(/^\/+/, '');
  const segments = normalized.split('/');
  const isTree = type === 'tree';
  const dirSegments = isTree ? segments : segments.slice(0, -1);
  const filename = segments[segments.length - 1];
  const lowerFilename = filename.toLowerCase();

  // Check directory exclusions
  for (const dir of dirSegments) {
    if (EXCLUDED_DIRS.has(dir.toLowerCase())) {
      return true;
    }
  }

  if (isTree) {
    return EXCLUDED_DIRS.has(lowerFilename);
  }

  // Check secrets (.env* except .env.example, private keys, and credential files)
  if (
    (lowerFilename.startsWith('.env') && lowerFilename !== '.env.example') ||
    SECRET_FILENAMES.has(lowerFilename) ||
    lowerFilename.startsWith('id_rsa.')
  ) {
    return true;
  }

  // Check lockfiles
  if (LOCKFILES.has(lowerFilename)) {
    return true;
  }

  // Check generated/minified
  if (
    lowerFilename.endsWith('.min.js') ||
    lowerFilename.endsWith('.min.css') ||
    lowerFilename.endsWith('.map')
  ) {
    return true;
  }

  // Check binary/media and secret key extensions
  const lastDot = lowerFilename.lastIndexOf('.');
  if (lastDot !== -1) {
    const ext = lowerFilename.slice(lastDot);
    if (BINARY_EXTENSIONS.has(ext) || SECRET_EXTENSIONS.has(ext)) {
      return true;
    }
  }
  if (lowerFilename.endsWith('.tar.gz')) {
    return true;
  }

  return false;
}

export function isManifest(path: string): boolean {
  const filename = path.split('/').pop()?.toLowerCase() || '';
  return MANIFEST_FILES.has(filename);
}

export function isReadme(path: string): boolean {
  const filename = path.split('/').pop()?.toLowerCase() || '';
  return README_FILES.has(filename);
}

export function isConfig(path: string): boolean {
  const filename = path.split('/').pop()?.toLowerCase() || '';
  return CONFIG_FILES.has(filename);
}

export function isCandidateEntryPoint(path: string): boolean {
  if (isExcluded(path)) return false;
  const segments = path.replace(/\\/g, '/').replace(/^\/+/, '').split('/');
  const isRootOrSrc = segments.length === 1 || (segments.length === 2 && segments[0] === 'src');
  if (!isRootOrSrc) return false;

  const filename = segments[segments.length - 1].toLowerCase();

  // Exclude test files
  if (
    filename.includes('.test.') ||
    filename.includes('.spec.') ||
    filename.includes('_test.') ||
    filename.endsWith('.test') ||
    filename.endsWith('.spec')
  ) {
    return false;
  }

  if (filename === 'mod.rs') return true;

  return ENTRY_PREFIXES.some(prefix => filename.startsWith(prefix));
}

export function getFilePriorityScore(path: string): number {
  const segments = path.replace(/\\/g, '/').replace(/^\/+/, '').split('/');
  const isRoot = segments.length === 1;

  // 1. Manifests & README.md
  if (isManifest(path) && !isConfig(path)) {
    return isRoot ? 100 : 90;
  }
  if (isReadme(path)) {
    return isRoot ? 95 : 85;
  }

  // 2. Candidate entry points
  if (isCandidateEntryPoint(path)) {
    return 80;
  }

  // 3. Key config files
  if (isConfig(path)) {
    return isRoot ? 70 : 65;
  }

  // 4. Shallow source files in src/ or root
  const depth = segments.length;
  if (depth === 1 || (depth === 2 && segments[0] === 'src')) {
    return 55;
  }

  // 5. Other deeper source files
  return Math.max(10, 45 - depth * 2);
}

export function detectLanguages(tree: GitTreeItem[], metadata?: Partial<RepoMetadata>): string[] {
  const languages = new Set<string>();

  if (metadata?.language) {
    languages.add(metadata.language);
  }

  let hasTsFiles = false;

  for (const item of tree) {
    if (isExcluded(item.path, item.type)) continue;

    const filename = item.path.split('/').pop()?.toLowerCase() || '';

    // Manifest mapping
    if (MANIFEST_LANGUAGE_MAP[filename]) {
      for (const lang of MANIFEST_LANGUAGE_MAP[filename]) {
        languages.add(lang);
      }
    }

    // Extension mapping
    const dotIndex = filename.lastIndexOf('.');
    if (dotIndex !== -1) {
      const ext = filename.slice(dotIndex);
      const lang = EXTENSION_LANGUAGE_MAP[ext];
      if (lang) {
        languages.add(lang);
        if (lang === 'TypeScript') hasTsFiles = true;
      }
    }
  }

  if (hasTsFiles) {
    languages.add('TypeScript');
  }

  return Array.from(languages);
}
