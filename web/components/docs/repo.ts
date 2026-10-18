/** Where the V2 sources, scripts and long-form docs live. One branch constant, so links cannot drift apart. */
export const REPO_URL = "https://github.com/ahmadhashimi/quantum-password-generator";
export const REPO_BRANCH = "v2";

/** A file in the repository, as GitHub shows it. */
export const repoFile = (path: string): string => `${REPO_URL}/blob/${REPO_BRANCH}/${path}`;

/** The same file as raw bytes, for `curl -O`. */
export const repoRaw = (path: string): string =>
  `https://raw.githubusercontent.com/ahmadhashimi/quantum-password-generator/${REPO_BRANCH}/${path}`;
