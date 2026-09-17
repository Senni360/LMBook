// Restricted SemVer keeps output paths safe and preview channels explicit.
export const releaseVersion =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(?:alpha|beta|rc|preview)\.(?:0|[1-9]\d*))?$/;
export const isPrerelease = (version) =>
  releaseVersion.test(version) && version.includes("-");
