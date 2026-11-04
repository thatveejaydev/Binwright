# Binwright — CEP Extension for Adobe Premiere Pro

A Common Extensibility Platform (CEP) extension for **Adobe Premiere Pro** providing automated project bin organization and disk media relocation.

---

## 🚀 Features & Tab Breakdown

### 1. `SORT` Tab (One-Click Project Cleanup)
* **Sort by Type**: Scans every asset in the project panel (Sequences, Video, Audio, Images, Graphics/MOGRTs, Captions, Solids) and organizes them into clean bins with a single click.
* **Preview Sort (Before & After Inspector)**:
  * Slide-up modal drawer showing exactly which items will move before any action occurs.
  * Shows origin and target paths (e.g. `GX010233.MP4` $\rightarrow$ `02 Footage/MP4`).
  * Identifies loose files on disk and protects locked/untouchable bins.
* **Create Bins**: Automatically creates the folder hierarchy in the project panel based on the active layout.
* **Remove Empty Bins**: Deletes unused, empty bins without touching protected or active layout folders.
* **Auto-Sort New Imports**: Background watcher that automatically files new assets into their designated bins the moment they are imported into Premiere Pro.

### 2. `LAYOUT` Tab (Customizable Presets & Rules)
* **Nested Bins (Slash Syntax `/`)**: Create sub-bins to any depth by using slashes in folder names (e.g. `02 Footage/Memes`, `02 Footage/Raw`, `03 Audio/SFX`, `03 Audio/Music`).
* **Filename Tag / Suffix Matching**:
  * Filter specific assets by filename tags (e.g. `_meme`, `_sfx`, `_broll`, `_music`).
  * Example: a rule for `02 Footage/Memes` matching `_meme` will sort `man screaming_meme.mp4` into memes, while standard camera `.mp4` footage falls through to your raw footage bin.
  * Click the 🏷️ button on any rule to add or change its tag anytime.
* **Rename Layout**: Click the **✎** button in the toolbar to rename the active folder layout at any time.
* **Preset Switcher**: Create new layouts (`+`), duplicate existing ones (`❐`), or delete unused custom layouts (`✕`).
* **Add Folder Rule (`+ Add Folder Rule`)**:
  * Define new bins and assign what they hold: Video, Audio, Images, Sequences, Camera RAW, Graphics, Captions, Solids, or Locked/Untouchable.
  * Optionally specify a **Filename Tag / Suffix** (like `_meme` or `_sfx`).
* **Folder Actions**:
  * **Rename Folder (✎)**: Rename individual folder rules inline.
  * **Edit Tag (🏷️)**: Update the filename tag filter for any rule.
  * **Delete Folder (✕)**: Remove any folder rule you don't need.
* **"Split by Type"**: Automatically creates per-format sub-bins (e.g., `Footage/MP4`, `Footage/MOV`, `Audio/WAV`, `Audio/MP3`) dynamically only for the formats present in the project.
* **Untouchable Bins**: Mark any folder as locked so nothing is moved into, out of, or deleted from it.

### 3. `MEDIA` Tab (Where Files Really Live)
* **Disk vs. Bin Visualization**:
  * **By folder on disk**: Shows physical file locations across your drives (`Downloads`, `Desktop`, project folder, external drives).
  * **By bin**: Shows items mapped to their Premiere project bins.
* **Loose File Detection**: Detects files saved in `Downloads`, `Desktop`, or external drives outside the project folder.
* **Select Loose**: Quickly selects all stray assets with one click.
* **Relocate & Relink**:
  * Moves or copies stray media directly into your project directory.
  * **Mirror layout folders**: Automatically organizes disk files into folders matching your bin layout (`Project/Audio/`, `Project/Footage/MOV/`, etc.).
  * Relinks media paths in Premiere Pro automatically.


---

## 🛠️ Installation & Setup

1. Double-click `install.bat` inside this folder.
2. The installer will:
   - Enable `PlayerDebugMode` in the Windows Registry so unsigned extensions can load.
   - Create a directory junction linking this folder directly to `%APPDATA%\Adobe\CEP\extensions\com.binwright.cep`.
3. Launch or restart **Adobe Premiere Pro**.
4. Open your project, then navigate to top menu:
   **Window** $\rightarrow$ **Extensions** $\rightarrow$ **Binwright**.

---

## 🔍 Standalone Testing & Debugging

* **Browser Preview**: Open `com.binwright.ppro/index.html` in Chrome or Edge to test the UI with mock project data.
* **Remote Debugger**: Open Google Chrome and navigate to `http://localhost:8088` while Premiere Pro is running to inspect the panel via Chrome DevTools.
