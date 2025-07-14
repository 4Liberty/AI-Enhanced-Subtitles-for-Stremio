# Enhanced RAR Uncompression Support for SubDL

## Overview
Successfully implemented comprehensive RAR uncompression support to ensure full SubDL compatibility, addressing the complete range of compressed subtitle formats.

## Key RAR Uncompression Enhancements

### 1. **Multi-Method RAR Extraction**
- **System Unrar Command**: Uses system `unrar` utility if available
- **Node-RAR Library**: Attempts to use node-rar package when installed
- **RAR-as-ZIP Processing**: Handles RAR files that are actually ZIP with .rar extension
- **Custom RAR Parser**: Basic RAR file structure parsing for simple cases
- **Brute Force Text Extraction**: Last resort pattern matching in raw binary data

### 2. **Enhanced RAR Signature Detection**
```javascript
// Multiple RAR signature patterns supported:
- RAR 5.0: [0x52, 0x61, 0x72, 0x21, 0x1A, 0x07, 0x01, 0x00]
- RAR 4.x: [0x52, 0x61, 0x72, 0x21, 0x1A, 0x07, 0x00]  
- Generic: [0x52, 0x61, 0x72, 0x21]
```

### 3. **Comprehensive ZIP Enhancement**
- **Multiple Format Support**: SRT, ASS, SSA, VTT, SUB, IDX files
- **Encoding Detection**: UTF-8, Latin1, ASCII, UTF-16LE support
- **Priority-based Extraction**: SRT files prioritized over other formats
- **Fallback Text Detection**: Searches for subtitle patterns in any text files

### 4. **Enhanced SubDL Integration**

**Format Detection:**
- Automatic detection of file formats from URLs and metadata
- Compression status identification (ZIP, RAR, GZ, 7Z)
- File size considerations for quality assessment

**Enhanced Scoring System:**
- **Format Bonuses**: SRT (30pts), ASS/SSA (20pts), VTT (15pts)
- **Compression Bonuses**: Compressed files (+10pts), uncompressed SRT (+5pts)
- **File Size Scoring**: Large files (>50KB: +15pts), Medium (>20KB: +10pts)
- **Hash Matching**: Increased to 400pts for perfect hash matches
- **IMDb Matching**: Increased to 250pts for IMDb ID matches

### 5. **Robust Error Handling**
- **Graceful Degradation**: Multiple fallback methods for each archive type
- **Encoding Recovery**: Tries multiple text encodings automatically
- **Pattern Recognition**: Searches for subtitle patterns in raw binary data
- **Memory Management**: Proper cleanup of temporary files and resources

## Technical Implementation

### **RAR Extraction Methods (Priority Order)**

1. **System Unrar Command**
   ```javascript
   extractRarWithUnrar(buffer)
   - Creates temporary RAR file
   - Executes system unrar command
   - Extracts to temporary directory
   - Finds and returns subtitle files
   - Automatic cleanup
   ```

2. **Node-RAR Library**
   ```javascript
   extractRarWithNodeRar(buffer)
   - Uses node-rar package if available
   - Direct memory extraction
   - Supports all RAR versions
   - Graceful fallback if library unavailable
   ```

3. **RAR-as-ZIP Processing**
   ```javascript
   extractRarAsZip(buffer, originalUrl)
   - Handles mislabeled ZIP files
   - Uses AdmZip library
   - Supports standard ZIP extraction
   ```

4. **Custom RAR Parser**
   ```javascript
   extractRarWithCustomParser(buffer)
   - Basic RAR header parsing
   - File entry detection
   - Direct data extraction
   - Works with simple RAR structures
   ```

5. **Brute Force Text Extraction**
   ```javascript
   bruteForceTextExtraction(buffer)
   - Scans entire buffer for subtitle patterns
   - Multiple encoding attempts
   - Pattern-based content extraction
   - Last resort method
   ```

### **Enhanced Archive Processing**

**ZIP File Improvements:**
- Multiple subtitle format support (SRT, ASS, VTT, SUB, IDX)
- Encoding detection and conversion
- Priority-based file selection
- Fallback text file processing

**Generic Archive Support:**
- Unknown format detection
- Text pattern extraction
- Multiple encoding attempts
- Content validation

## SubDL-Specific Enhancements

### **Enhanced Response Parsing**
```javascript
parseSubdlSearchResponse(data, videoId, infoHash)
- Format detection from URL and metadata
- Compression status identification
- Enhanced Turkish language detection
- File size and quality assessment
```

### **Advanced Scoring Algorithm**
```javascript
calculateEnhancedSubtitleScore(subtitle, videoId, infoHash)
- Multi-factor scoring system
- Format-specific bonuses
- Compression considerations
- Quality keyword recognition
- Release group identification
- Turkish language prioritization
```

### **Quality Indicators**
- **Video Quality**: 2160p, 4K, 1080p, 720p, 480p
- **Encoding**: x264, x265, H264, H265, HEVC
- **Source**: BluRay, WEB-DL, WebRip, DVDRip
- **Audio**: AAC, AC3, DTS, TrueHD, Dolby Atmos
- **Features**: HDR, Dolby Vision

### **Release Group Recognition**
- YTS, RARBG, SPARKS, GECKOS, CMRG, NTG
- MeGusta, XviD, Amiable, Rovers, PsychD
- Deflate, Crimson, and other popular groups

## Error Recovery & Fallbacks

### **Multi-Level Fallback System**
1. **Primary Method**: Format-specific extraction
2. **Secondary Method**: Alternative extraction approach
3. **Tertiary Method**: Generic text pattern matching
4. **Final Fallback**: Raw binary data scanning

### **Encoding Support**
- **Primary**: UTF-8 (most common)
- **Secondary**: Latin1 (European languages)
- **Tertiary**: ASCII (basic compatibility)
- **Quaternary**: UTF-16LE (Unicode support)

### **Content Validation**
- Subtitle format pattern recognition
- Time code validation
- Content length verification
- Language-specific validation

## Performance Optimizations

### **Memory Management**
- Efficient buffer handling
- Temporary file cleanup
- Resource disposal
- Memory leak prevention

### **Processing Efficiency**
- Priority-based extraction order
- Early termination on success
- Parallel encoding attempts
- Optimized pattern matching

## Quality Assurance

### **Testing Coverage**
- ✅ RAR 4.x and 5.0 format support
- ✅ ZIP file compatibility
- ✅ Multiple encoding support
- ✅ Error handling and recovery
- ✅ Memory management
- ✅ Content validation

### **Reliability Features**
- Comprehensive error logging
- Graceful failure handling
- Multiple extraction attempts
- Automatic format detection
- Content quality validation

## Future Enhancements

### **Potential Improvements**
- 7-Zip format support
- TAR.GZ archive support
- Advanced RAR 6.0 support
- Machine learning-based quality scoring
- Caching of extraction results

### **Performance Optimizations**
- Parallel extraction processing
- Streaming decompression
- Incremental content validation
- Smart caching strategies

## Implementation Status

### **Completed Features** ✅
- Multi-method RAR extraction
- Enhanced ZIP processing
- Comprehensive encoding support
- Advanced scoring algorithm
- Error recovery mechanisms
- Content validation
- Memory management
- Performance optimizations

### **SubDL Integration** ✅
- Format detection enhancement
- Compression status identification
- Enhanced Turkish language support
- Quality-based scoring
- Release group recognition
- Hash and IMDb matching improvements

This implementation ensures that SubDL's compressed subtitle files (particularly RAR archives) are fully supported with multiple extraction methods, comprehensive error handling, and optimal quality scoring for the best user experience.
