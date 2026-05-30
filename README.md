# Subsource.net Batch Downloader

A userscript that adds batch subtitle downloading support to Subsource.net.

It adds checkboxes to supported subtitle listing pages, lets you select multiple subtitle rows, downloads each selected subtitle through the Subsource API, and combines the extracted subtitle files into one flat ZIP archive.

## Features

- Adds checkboxes beside subtitle rows.
- Includes a select-all checkbox.
- Shows a live selected-subtitle counter.
- Downloads selected subtitles through the Subsource API.
- Combines selected subtitle files into one ZIP archive.
- Keeps the ZIP flat without extra subfolders.
- Renames duplicate filenames, such as `subtitle_2.srt`, to avoid overwriting files.
- Supports movie pages and season pages.

## Supported URLs

```text
https://subsource.net/subtitles/title-name
https://subsource.net/subtitles/title-name/season-1
```

## Installation

1. Install a userscript manager such as Tampermonkey or Violentmonkey.
2. Open `subsource-batch-downloader.user.js`.
3. Install the script through your userscript manager.
4. Open a supported Subsource.net subtitles page.
5. Use the userscript manager menu and choose `Set API Key`.
6. Enter your Subsource API key.
7. Select subtitles and click `Download`.

## Notes

- A valid Subsource API key is required.
- The API key is stored locally by your userscript manager using userscript storage.
- The script does not upload your API key or subtitles anywhere else.
- If one subtitle fails to download, the script continues with the remaining selected subtitles.

## Files

- `subsource-batch-downloader.user.js` - the userscript.
- `LICENSE` - GPL-3.0 license notice.

## Credits

Based on the original Subsource.net Batch Downloader userscript by `kylyte`, with fixes for season URLs, safer DOM handling, duplicate filenames, stale selection state, and flat ZIP output.

## License

GPL-3.0
