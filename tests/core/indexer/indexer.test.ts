import { describe, it, expect } from 'vitest';
import { prioritizeTree, buildRepoIndex, extractRepoIndex } from '../../../src/core/indexer/indexer';
import { isExcluded, isCandidateEntryPoint, isManifest } from '../../../src/core/indexer/prioritizer';
import { GitTreeItem } from '../../../src/core/github/client';
import { RepoIdentity } from '../../../src/core/github/url-parser';

describe('Repository Indexer & Prioritizer', () => {
  describe('isExcluded', () => {
    it('excludes noise and build directories', () => {
      expect(isExcluded('node_modules/react/index.js')).toBe(true);
      expect(isExcluded('.git/config')).toBe(true);
      expect(isExcluded('dist/bundle.js')).toBe(true);
      expect(isExcluded('build/app.js')).toBe(true);
      expect(isExcluded('out/main.js')).toBe(true);
      expect(isExcluded('target/debug/app')).toBe(true);
      expect(isExcluded('vendor/autoload.php')).toBe(true);
      expect(isExcluded('.idea/workspace.xml')).toBe(true);
      expect(isExcluded('.vscode/settings.json')).toBe(true);
      expect(isExcluded('coverage/lcov.info')).toBe(true);
      expect(isExcluded('src/__pycache__/app.pyc')).toBe(true);
      expect(isExcluded('.next/server.js')).toBe(true);
      expect(isExcluded('.nuxt/index.js')).toBe(true);
    });

    it('excludes binary and media file extensions', () => {
      const binaries = [
        'assets/logo.png', 'photo.jpg', 'image.jpeg', 'icon.gif', 'favicon.ico',
        'diagram.svg', 'video.mp4', 'clip.webm', 'audio.mp3', 'sound.wav',
        'archive.zip', 'bundle.tar', 'archive.tar.gz', 'document.pdf',
        'module.wasm', 'app.exe', 'lib.dll', 'lib.so', 'lib.dylib',
        'font.woff', 'font.woff2', 'font.ttf', 'font.eot'
      ];
      for (const file of binaries) {
        expect(isExcluded(file)).toBe(true);
      }
    });

    it('excludes lockfiles and generated minified/map files', () => {
      const lockfiles = [
        'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'Cargo.lock',
        'poetry.lock', 'composer.lock', 'Gemfile.lock'
      ];
      for (const lockfile of lockfiles) {
        expect(isExcluded(lockfile)).toBe(true);
        expect(isExcluded(`packages/sub/${lockfile}`)).toBe(true);
      }

      expect(isExcluded('dist/bundle.min.js')).toBe(true);
      expect(isExcluded('styles.min.css')).toBe(true);
      expect(isExcluded('app.js.map')).toBe(true);
    });

    it('excludes secret files but retains .env.example', () => {
      expect(isExcluded('.env')).toBe(true);
      expect(isExcluded('.env.local')).toBe(true);
      expect(isExcluded('.env.production')).toBe(true);
      expect(isExcluded('.env.development')).toBe(true);
      expect(isExcluded('config/.env.secret')).toBe(true);

      // .env.example should NOT be excluded
      expect(isExcluded('.env.example')).toBe(false);
      expect(isExcluded('config/.env.example')).toBe(false);
    });

    it('does not exclude standard source files', () => {
      expect(isExcluded('src/index.ts')).toBe(false);
      expect(isExcluded('package.json')).toBe(false);
      expect(isExcluded('README.md')).toBe(false);
      expect(isExcluded('docs/architecture.md')).toBe(false);
    });
  });

  describe('isManifest', () => {
    it('identifies key manifest and configuration files', () => {
      expect(isManifest('package.json')).toBe(true);
      expect(isManifest('Cargo.toml')).toBe(true);
      expect(isManifest('pyproject.toml')).toBe(true);
      expect(isManifest('go.mod')).toBe(true);
      expect(isManifest('sub/package.json')).toBe(true);
      expect(isManifest('src/index.ts')).toBe(false);
    });
  });

  describe('isCandidateEntryPoint', () => {
    it('identifies entry points in root and src/', () => {
      expect(isCandidateEntryPoint('index.ts')).toBe(true);
      expect(isCandidateEntryPoint('src/index.ts')).toBe(true);
      expect(isCandidateEntryPoint('main.py')).toBe(true);
      expect(isCandidateEntryPoint('src/main.rs')).toBe(true);
      expect(isCandidateEntryPoint('src/mod.rs')).toBe(true);
      expect(isCandidateEntryPoint('src/cli.ts')).toBe(true);
      expect(isCandidateEntryPoint('server.go')).toBe(true);
      // Not entry points
      expect(isCandidateEntryPoint('src/index.test.ts')).toBe(false);
      expect(isCandidateEntryPoint('src/components/Button.tsx')).toBe(false);
    });
  });

  describe('prioritizeTree', () => {
    it('excludes node_modules, .git, and binaries, prioritizing manifests and entry points', () => {
      const mockTree: GitTreeItem[] = [
        { path: 'node_modules/react/index.js', mode: '100644', type: 'blob', sha: '1' },
        { path: 'dist/bundle.js', mode: '100644', type: 'blob', sha: '2' },
        { path: 'package.json', mode: '100644', type: 'blob', sha: '3' },
        { path: 'src/index.ts', mode: '100644', type: 'blob', sha: '4' },
        { path: 'README.md', mode: '100644', type: 'blob', sha: '5' },
        { path: 'image.png', mode: '100644', type: 'blob', sha: '6' }
      ];

      const result = prioritizeTree(mockTree);
      expect(result.excluded).toContain('node_modules/react/index.js');
      expect(result.excluded).toContain('dist/bundle.js');
      expect(result.excluded).toContain('image.png');
      expect(result.manifests).toContain('package.json');
      expect(result.candidateEntryPoints).toContain('src/index.ts');
      expect(result.prioritized).toEqual(['package.json', 'README.md', 'src/index.ts']);
    });

    it('ranks manifests, entry points, configs, and shallow sources correctly', () => {
      const mockTree: GitTreeItem[] = [
        { path: 'src/components/DeepNested.tsx', mode: '100644', type: 'blob', sha: '1' },
        { path: 'src/index.ts', mode: '100644', type: 'blob', sha: '2' },
        { path: 'tsconfig.json', mode: '100644', type: 'blob', sha: '3' },
        { path: 'README.md', mode: '100644', type: 'blob', sha: '4' },
        { path: 'package.json', mode: '100644', type: 'blob', sha: '5' },
        { path: 'src/utils.ts', mode: '100644', type: 'blob', sha: '6' },
        { path: 'Dockerfile', mode: '100644', type: 'blob', sha: '7' }
      ];

      const result = prioritizeTree(mockTree);
      // package.json (manifest) & README.md should be at the top
      expect(result.prioritized.indexOf('package.json')).toBeLessThan(result.prioritized.indexOf('src/index.ts'));
      expect(result.prioritized.indexOf('README.md')).toBeLessThan(result.prioritized.indexOf('src/index.ts'));
      // Entry point should be before config files
      expect(result.prioritized.indexOf('src/index.ts')).toBeLessThan(result.prioritized.indexOf('tsconfig.json'));
      // Configs before deep source files
      expect(result.prioritized.indexOf('tsconfig.json')).toBeLessThan(result.prioritized.indexOf('src/components/DeepNested.tsx'));
      // Shallow source before deep source
      expect(result.prioritized.indexOf('src/utils.ts')).toBeLessThan(result.prioritized.indexOf('src/components/DeepNested.tsx'));
    });

    it('respects maxPrioritized limit', () => {
      const mockTree: GitTreeItem[] = Array.from({ length: 30 }, (_, i) => ({
        path: `src/file${i}.ts`,
        mode: '100644',
        type: 'blob' as const,
        sha: `sha${i}`
      }));

      const result = prioritizeTree(mockTree, 10);
      expect(result.prioritized).toHaveLength(10);
    });

    it('detects multiple ecosystem manifests and candidate entry points across languages', () => {
      const mockTree: GitTreeItem[] = [
        { path: 'Cargo.toml', mode: '100644', type: 'blob', sha: '1' },
        { path: 'src/main.rs', mode: '100644', type: 'blob', sha: '2' },
        { path: 'pyproject.toml', mode: '100644', type: 'blob', sha: '3' },
        { path: 'app.py', mode: '100644', type: 'blob', sha: '4' },
        { path: 'go.mod', mode: '100644', type: 'blob', sha: '5' },
        { path: 'server.go', mode: '100644', type: 'blob', sha: '6' },
        { path: 'src/main.test.ts', mode: '100644', type: 'blob', sha: '7' }
      ];

      const result = prioritizeTree(mockTree);
      expect(result.manifests).toEqual(expect.arrayContaining(['Cargo.toml', 'pyproject.toml', 'go.mod']));
      expect(result.candidateEntryPoints).toEqual(expect.arrayContaining(['src/main.rs', 'app.py', 'server.go']));
      // Test files should NOT be candidate entry points
      expect(result.candidateEntryPoints).not.toContain('src/main.test.ts');
    });
  });

  describe('buildRepoIndex / extractRepoIndex', () => {
    const identity: RepoIdentity = {
      owner: 'octocat',
      repo: 'hello-world',
      branch: 'main',
      commitSha: '6dcb09b5b57875f334f61aebed695e2e4193db5e',
      pageType: 'repo_root'
    };

    const tree: GitTreeItem[] = [
      { path: 'package.json', mode: '100644', type: 'blob', sha: '1' },
      { path: 'tsconfig.json', mode: '100644', type: 'blob', sha: '2' },
      { path: 'src', mode: '040000', type: 'tree', sha: '3' },
      { path: 'src/index.ts', mode: '100644', type: 'blob', sha: '4' },
      { path: 'README.md', mode: '100644', type: 'blob', sha: '5' },
      { path: 'node_modules/dep/index.js', mode: '100644', type: 'blob', sha: '6' }
    ];

    it('builds a structured RepoIndex correctly', () => {
      const index = buildRepoIndex(identity, tree, {
        defaultBranch: 'main',
        language: 'TypeScript'
      });

      expect(index.identity).toEqual(identity);
      expect(index.defaultBranch).toBe('main');
      expect(index.commitSha).toBe('6dcb09b5b57875f334f61aebed695e2e4193db5e');
      expect(index.languages).toContain('TypeScript');
      expect(index.manifests).toContain('package.json');
      expect(index.manifests).toContain('tsconfig.json');
      expect(index.candidateEntryPoints).toContain('src/index.ts');
      expect(index.prioritizedFiles).toContain('package.json');
      expect(index.prioritizedFiles).toContain('src/index.ts');
      expect(index.prioritizedFiles).not.toContain('node_modules/dep/index.js');
      expect(index.treeOutline).toContain('src/');
      expect(index.treeOutline).toContain('index.ts');
      expect(index.treeOutline).not.toContain('node_modules');
    });

    it('extractRepoIndex is an alias of buildRepoIndex', () => {
      expect(extractRepoIndex).toBe(buildRepoIndex);
    });

    it('falls back defaultBranch and commitSha when not explicitly in metadata', () => {
      const identityNoSha: RepoIdentity = {
        owner: 'octocat',
        repo: 'hello-world',
        pageType: 'repo_root'
      };

      const index = buildRepoIndex(identityNoSha, tree);
      expect(index.defaultBranch).toBe('main');
      expect(index.commitSha).toBe('');
    });
  });
});
