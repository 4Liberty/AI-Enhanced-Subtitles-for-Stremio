
# Stremio Subtitle Addon Installation Guide

This guide explains how to install and use the Stremio OpenSubtitles.com subtitle addon for Turkish subtitles.

## Quick Installation

1. Open the [configuration page](../configure.html) in your browser.
2. Select your preferred language (Turkish is default).
3. Click the generated install link, or copy it to Stremio's "Add addon by URL" field.
4. Subtitles will appear automatically in Stremio for supported content.

## Requirements

- Stremio desktop or mobile app (latest version recommended)
- Internet connection

## Advanced: Self-Hosting

If you want to run your own instance:

1. Clone this repository:
   ```bash
   git clone https://github.com/opensubtitles/vlsub-opensubtitles-com.git
   cd vlsub-opensubtitles-com
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Set your OpenSubtitles API key as an environment variable:
   ```bash
   export OPENSUBTITLES_API_KEY=your_api_key_here
   ```
4. Start the server:
   ```bash
   npm start
   ```
5. Open the local configuration page (e.g., http://localhost:7000/configure.html) to generate your Stremio install link.

## Support

- [GitHub Issues](https://github.com/opensubtitles/vlsub-opensubtitles-com/issues)
- [OpenSubtitles.com](https://www.opensubtitles.com/)

#### macOS
```
~/Library/Application Support/org.videolan.vlc/lua/extensions/
```

To open this directory:
1. Open Finder
2. Press `Cmd + Shift + G`
3. Paste the path above
4. Press Enter

#### Linux
```
~/.local/share/vlc/lua/extensions/
```

Alternative locations:
- `~/.vlc/lua/extensions/`
- `/usr/share/vlc/lua/extensions/` (system-wide)

### Step 3: Copy the File

1. Create the extensions directory if it doesn't exist
2. Copy `vlsubcom.lua` to the extensions directory
3. Ensure the file has proper permissions (Linux/macOS: `chmod 644 vlsubcom.lua`)

### Step 4: Restart VLC

Close and restart VLC Media Player completely.

### Step 5: Access the Extension

1. Open VLC
2. Go to `View` menu
3. Look for `VLSub OpenSubtitles.com`
4. Click to open the extension

## Verification

After installation, verify the extension works:

1. Open a video file in VLC
2. Open the VLSub extension
3. You should see the main interface with search options
4. Try opening the configuration to test the interface

## Troubleshooting Installation

### Extension Not Visible in Menu

**Possible causes and solutions:**

1. **File in wrong location**
   - Double-check the extensions directory path
   - Ensure the file is named exactly `vlsubcom.lua`

2. **VLC not restarted**
   - Close VLC completely and restart

3. **Syntax error in file**
   - Re-download the file from the official releases page
   - Check file integrity (should be around 100-200KB)

4. **Permissions issue (Linux/macOS)**
   ```bash
   chmod 644 ~/.local/share/vlc/lua/extensions/vlsubcom.lua
   ```

5. **VLC version too old**
   - Update to VLC 3.0 or newer

### Extension Opens But Shows Errors

1. **Check VLC version**: Ensure you're using VLC 3.0+
2. **Check internet connection**: Extension requires internet access
3. **Check debug output**: Tools → Messages (enable debug mode)

### Permission Denied Errors

**Windows:**
- Run the installer as Administrator
- Check if antivirus is blocking the file

**macOS:**
- Grant necessary permissions in System Preferences → Security & Privacy

**Linux:**
- Ensure your user has write permissions to the home directory

## Alternative Installation Methods

### Package Managers

**Homebrew (macOS) - Coming Soon:**
```bash
brew install --cask vlsub-opensubtitles-com
```

**Snap (Linux) - Coming Soon:**
```bash
snap install vlsub-opensubtitles-com
```

### Build from Source

```bash
git clone https://github.com/opensubtitles/vlsub-opensubtitles-com.git
cd vlsub-opensubtitles-com
cp vlsubcom.lua "$(vlc-config --prefix)/share/vlc/lua/extensions/"
```

## Uninstallation

To remove the extension:

1. Close VLC
2. Delete `vlsubcom.lua` from the extensions directory
3. Optionally, remove configuration files from:
   - Windows: `%APPDATA%\vlc\lua\extensions\userdata\vlsub.com\`
   - macOS/Linux: `~/.local/share/vlc/lua/extensions/userdata/vlsub.com/`

## Next Steps

After successful installation:

1. [Configure the extension](usage.md#configuration)
2. [Set up your OpenSubtitles.com account](usage.md#account-setup)
3. [Learn how to search and download subtitles](usage.md#basic-usage)



