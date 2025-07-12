# Contributing to VLSub OpenSubtitles.com

Thank you for your interest in contributing to VLSub OpenSubtitles.com! This document provides guidelines and information for contributors.

## 🤝 How to Contribute

### Reporting Bugs 🐛

Before creating a bug report, please:
1. **Search existing issues** to avoid duplicates
2. **Test with the latest version** to ensure the bug still exists
3. **Gather system information** (OS, VLC version, extension version)

When creating a bug report, include:
  - Operating System and version
  - VLC Media Player version
  - Extension version
  - Video file format/source

Use our [Bug Report Template](.github/ISSUE_TEMPLATE/bug_report.md).

### Suggesting Features 💡

Feature requests are welcome! Please:
1. **Check existing feature requests** to avoid duplicates
2. **Explain the use case** and why it would be valuable
3. **Describe the proposed solution** in detail
4. **Consider implementation complexity**

Use our [Feature Request Template](.github/ISSUE_TEMPLATE/feature_request.md).

### Code Contributions 💻

#### Getting Started

1. **Fork the repository**
   ```bash
   git clone https://github.com/opensubtitles/vlsub-opensubtitles-com.git
   cd vlsub-opensubtitles-com
   ```

2. **Set up development environment**
   - Install VLC Media Player 3.0+
   - Install Lua 5.3+ for syntax checking
   - Install curl for testing downloads

3. **Create a feature branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

#### Development Guidelines

##### Code Style

##### Example:
```lua
local function searchSubtitlesByHash()
  local movie_hash = openSub.file.hash
  local byte_size = openSub.file.bytesize
  
  if not movie_hash or movie_hash == "" then
    vlc.msg.err("[VLSub] No movie hash available")
    return false
  end
  
  -- API call logic here
end

local MAX_RETRY_ATTEMPTS = 3
local DEFAULT_TIMEOUT = 30
```

##### Error Handling

```lua
local function downloadSubtitle(url)
  if not url or url == "" then
    vlc.msg.err("[VLSub] Invalid download URL")
    setMessage(error_tag("Invalid download URL"))
    return false
  end
  
  local client = Curl.new()
  local res = client:get(url)
  
  if not res then
    vlc.msg.err("[VLSub] Network request failed")
    setMessage(error_tag("Network connection failed"))
    return false
  end
  
  if res.status ~= 200 then
    vlc.msg.err("[VLSub] Download failed with status: " .. res.status)
    setMessage(error_tag("Download failed: HTTP " .. res.status))
    return false
  end
  
  return res.body
end
```

#### Testing

##### Manual Testing Checklist

##### Test Cases
1. **Fresh installation** - no existing config
2. **Upgrade scenario** - existing config migration
3. **Network failure** - offline/timeout scenarios
4. **Authentication failure** - invalid credentials
5. **No results** - search with no matches
6. **Large files** - movies >4GB for hash calculation
7. **Special characters** - filenames with unicode/symbols

#### Pull Request Process

1. **Update documentation** if needed
2. **Add/update tests** for new functionality
3. **Run syntax check**:
   ```bash
   lua5.3 -l vlsubcom.lua -e "print('Syntax OK')"
   ```
4. **Update CHANGELOG.md** with your changes
5. **Create pull request** with clear description

##### Pull Request Template
```markdown
## Description
Brief description of changes

## Type of Change

## Testing

## Checklist
```

## 🏗️ Project Structure

```
vlsub-opensubtitles-com/
├── vlsubcom.lua              # Main extension file
├── README.md                 # Project documentation
├── CHANGELOG.md              # Version history
├── CONTRIBUTING.md           # This file
├── LICENSE                   # GPL-3.0 license
├── docs/                     # Additional documentation
│   ├── installation.md       # Installation guide
│   ├── usage.md              # Usage examples
│   ├── api.md                # API documentation
│   ├── troubleshooting.md    # Common issues
│   └── screenshots/          # UI screenshots
├── scripts/                  # Installation scripts
│   ├── install.sh            # Unix installation
│   └── install.ps1           # Windows installation
└── .github/                  # GitHub specific files
    ├── workflows/            # CI/CD workflows
    ├── ISSUE_TEMPLATE/       # Issue templates
    └── PULL_REQUEST_TEMPLATE.md
```

## 📚 Key Components

### Core Functions

### API Integration

### User Interface

## 🔍 Code Review Criteria

### Functionality

### Code Quality

### Performance

### Security

## 🌍 Internationalization

Currently, the extension supports interface translation for:

To add a new language:
1. Add language code to `translations_avail` in the script
2. Create translation file in XML format
3. Test the interface with new translations

## 📝 Documentation

### Code Documentation

### User Documentation

## 🚀 Release Process

1. **Version bump** in `vlsubcom.lua`
2. **Update CHANGELOG.md** with release notes
3. **Create GitHub release** with tag
4. **Test installation scripts**
5. **Update documentation** if needed

## 📞 Getting Help


## 🏆 Recognition

Contributors will be recognized in:

## 📄 License

By contributing, you agree that your contributions will be licensed under the GNU General Public License v3.0.


Thank you for contributing to VLSub OpenSubtitles.com! 🎉