# Trusted Publisher Setup Guide

This document explains how to set up **NPM Trusted Publishing with OIDC** for the `@tafeen/fireworks-firepass-provider` package.

## What is Trusted Publishing?

Trusted publishing allows you to publish npm packages directly from GitHub Actions using **OpenID Connect (OIDC)** authentication, eliminating the need for long-lived npm tokens. This provides:

- **Better security**: No long-lived tokens that can be leaked or compromised
- **Automatic provenance**: npm generates signed provenance attestations for your package
- **Simplified workflow**: No need to manage `NPM_TOKEN` secrets in GitHub

## Prerequisites

1. **npm CLI 11.5.1+** and **Node.js 22.14.0+** (already configured in workflows)
2. **GitHub repository**: https://github.com/Tafeen/fireworks-tafeen-provider
3. **npmjs.com account** with access to the `@tafeen` organization
4. **Package already exists** or needs to be created on npmjs.com

## Step 1: Configure the GitHub Repository

The repository is already configured with the correct workflow (`.github/workflows/publish.yml`):

```yaml
permissions:
  contents: read
  id-token: write  # Required for OIDC token exchange
```

Key workflow features:
- Uses `actions/setup-node@v4` with Node.js 22.x
- Runs tests before publishing
- Uses `npm publish --provenance` for automatic provenance generation
- **NO `NPM_TOKEN` secret needed!**

## Step 2: Configure Trusted Publisher on npmjs.com

### For New Packages (First Publish)

1. Log in to [npmjs.com](https://www.npmjs.com) with an account that has access to the `@tafeen` organization
2. Navigate to your profile → **Packages** → **Create a new package**
3. Create the package `@tafeen/fireworks-firepass-provider` (if it doesn't exist yet)
4. Go to the package → **Settings** → **Trusted Publishers**
5. Click **"GitHub Actions"**
6. Fill in the fields:
   - **Organization or user**: `Tafeen`
   - **Repository**: `fireworks-tafeen-provider`
   - **Workflow filename**: `publish.yml` (must match exactly)
   - **Environment name**: (optional) leave blank for now
7. Click **"Create"**

### For Existing Packages

1. Go to https://www.npmjs.com/package/@tafeen/fireworks-firepass-provider
2. Navigate to **Settings** → **Trusted Publishers**
3. Click **"Add a trusted publisher"**
4. Select **GitHub Actions**
5. Fill in the fields as above
6. Click **"Create"**

## Step 3: Restrict Token Access (Recommended)

After setting up trusted publishing, enhance security by restricting traditional token access:

1. Go to package **Settings** → **Publishing access**
2. Select **"Require two-factor authentication and disallow tokens"**
3. Click **Update Package Settings**

This prevents publishing via traditional tokens while keeping trusted publishing working.

## Step 4: Update package.json Repository URL

Ensure the `package.json` has the correct repository URL (already done):

```json
{
  "repository": {
    "type": "git",
    "url": "https://github.com/Tafeen/fireworks-tafeen-provider"
  }
}
```

⚠️ **Important**: The repository URL must exactly match your GitHub repository for trusted publishing to work.

## Step 5: Publish Your Package

### Trigger a Release

1. Create a new GitHub release:
   ```bash
   git tag -a v2.0.0 -m "Release version 2.0.0"
   git push origin v2.0.0
   ```

2. Or create a release via GitHub UI:
   - Go to https://github.com/Tafeen/fireworks-tafeen-provider/releases
   - Click **"Draft a new release"**
   - Create a new tag (e.g., `v2.0.0`)
   - Fill in release notes
   - Click **"Publish release"**

3. The workflow will automatically trigger and publish to npm with provenance

## Troubleshooting

### Error: "Unable to authenticate" (ENEEDAUTH)

**Cause**: The trusted publisher configuration doesn't match the workflow.

**Solution**:
1. Verify the workflow filename matches exactly (case-sensitive): `publish.yml`
2. Check that `Organization or user` is exactly `Tafeen`
3. Ensure `Repository` is exactly `fireworks-tafeen-provider`
4. Confirm the repository URL in `package.json` matches exactly

### Error: "id-token: write" permission denied

**Cause**: Missing permissions in workflow.

**Solution**: Ensure your workflow has:
```yaml
permissions:
  id-token: write
  contents: read
```

### Error: 404 when publishing

**Cause**: The package doesn't exist on npm or you don't have publish access.

**Solution**:
1. Create the package on npmjs.com first
2. Verify you have publish access to the `@tafeen` organization
3. If the package already exists, ensure you're listed as a maintainer

### Provenance not generated

**Cause**: Provenance only works for:
- Public repositories (✅ we have this)
- Public packages (✅ this is public)
- GitHub-hosted runners (✅ we use ubuntu-latest)

**Solution**: Ensure you're using `--provenance` flag in the publish command (already configured).

### Package name mismatch

**Cause**: The package.json repository URL doesn't match the GitHub repository.

**Solution**: Verify in `package.json`:
```json
"repository": {
  "type": "git", 
  "url": "https://github.com/Tafeen/fireworks-tafeen-provider"
}
```

## Verification

After publishing, verify provenance was generated:

```bash
npm view @tafeen/fireworks-firepass-provider@latest --json | grep -A 10 provenance
```

You should see a `publishTime`, `publisher`, and `provenance` fields with a Sigstore attestation.

On the npmjs.com package page, you should see a **"Provenance"** badge/link showing the GitHub Actions workflow that published it.

## Security Best Practices

1. ✅ **Enable 2FA** on your npm account (required for trusted publishing)
2. ✅ **Restrict token publishing** after setting up trusted publishing
3. ✅ **Use GitHub environments** for additional approval requirements (optional)
4. ✅ **Enable branch protection** on the `main` branch
5. ✅ **Require PR reviews** before merging to `main`
6. ✅ **Audit trusted publisher** configurations regularly

## Migration from Token-Based Publishing

If you're currently using `NPM_TOKEN`:

1. Set up trusted publishing (Steps 1-3 above)
2. Create a test release to verify it works
3. Once verified, restrict token access (Step 3)
4. Revoke any existing automation tokens from your npm account
5. Remove `NPM_TOKEN` secret from GitHub repository settings

## Additional Resources

- [npm Trusted Publishers Documentation](https://docs.npmjs.com/trusted-publishers)
- [GitHub Actions OIDC Documentation](https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/about-security-hardening-with-openid-connect)
- [Provenance Statements on npm](https://docs.npmjs.com/generating-provenance-statements)
- [OpenSSF Trusted Publishers Specification](https://github.com/ossf/wg-securing-software-repos/blob/main/trusted-publishers.md)

## Support

If you encounter issues:
1. Check the [GitHub Actions logs](https://github.com/Tafeen/fireworks-tafeen-provider/actions)
2. Verify your npmjs.com package settings
3. Open an issue at https://github.com/Tafeen/fireworks-tafeen-provider/issues
