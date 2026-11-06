![Binwright wordmark beside a blue folder icon](assets/binwright-banner-blue.png)

![Platform: Windows](https://img.shields.io/badge/platform-Windows-0078D4)
![Host: Adobe Premiere Pro](https://img.shields.io/badge/host-Adobe%20Premiere%20Pro-7065E8)
![Extension: CEP](https://img.shields.io/badge/extension-CEP-8A56AC)
[![Extension version: 1.0.0](https://img.shields.io/badge/version-1.0.0-E86D2C)](com.binwright.ppro/CSXS/manifest.xml)

Binwright is a Windows CEP extension that organizes items in Premiere Pro's **Project panel** and helps you collect linked media into one place.

| Tab | What it does |
| --- | --- |
| **Sort** | Organize project items into bins, preview moves, and find duplicate imports. |
| **Layout** | Build reusable bin structures and decide what goes into each bin. |
| **Media** | See where files live on disk, then copy or move selected files and relink them in Premiere. |

## 📦 Install on Windows

1. Download or clone this repository. If you downloaded a ZIP, extract it to a folder you plan to keep.
2. Close Premiere Pro and double-click [`install.bat`](install.bat).
3. Open Premiere Pro and open a project.
4. Choose **Window → Extensions → Binwright**.

The installer enables CEP debug mode for your Windows account so Premiere can load the unsigned panel. It links the extension to the extracted folder or copies it into your user extensions folder if linking fails. Keep the extracted folder in place for a linked installation. Binwright requires a Premiere Pro build that can load CEP extensions.

## 🗂️ Sort project items

1. Open **Sort** and select a layout. **Default Clean** gives you bins for sequences, footage, audio, graphics, and images.
2. Click **Review & Sort**. The review lists each proposed move, its current bin, its destination, and the matching rule. Filter the list by media type or look for items linked to media outside the project folder.
3. Click **Sort items** to apply the moves. Premiere project bins change and the source files stay in place on disk.

- **Rescan** refreshes the project and the count of items ready to sort.
- **Skip review** (the lightning icon) applies the sort immediately when you click the main sort button.
- **Auto-sort on import** checks for matching items at the top level of the Project panel while Binwright is open. Turning it on can also sort matching items already at the top level.
- **Undo sort** from the last-sort summary, or press **Ctrl+Z** while the Binwright panel has focus.

### 🛠️ Utilities

- **Create Layout Bins** builds the selected layout's bin hierarchy before you sort anything.
- **Prune Empty Bins** removes empty bins while preserving layout bins and protected bins.
- **Find Duplicates** groups Project panel entries that point to the same source path and shows their names, bins, and counts. To merge duplicates, run **Edit → Consolidate Duplicates** in Premiere. That command applies to the entire project. Binwright's scan is a preview.
- **Move all to root…** moves items and sequences to the top level of the Project panel and deletes the resulting empty bins after confirmation. This reset includes protected bins.

## 📐 Build a layout

Open **Layout** and use the **Layout actions** menu to create a layout or duplicate **Default Clean** as a starting point. You can switch between saved layouts and rename or delete custom layouts. Use **Export Layout Preset** and **Import Layout Preset** to back up or share layouts as JSON files.

1. Click **+ Add Folder Rule** and name the bin.
2. Choose a **Parent Bin** to nest it, such as **SFX** inside **03 Audio**. Expand or collapse parent bins to browse the structure.
3. Choose a media type and add optional filters. Available types include video, audio, graphics (still images), nests (sequences), Camera RAW, MOGRTs and titles, captions and subtitles, generated media, and any file type.
4. Save the rule, then return to **Sort** to preview it.

Use the rule menu to rename a bin rule, lock or unlock it, or delete it. Drag rules to reorder them. A parent with child rules acts as a container. Its child bins can receive matching items. Lock a bin to keep sorting from moving items into or out of that bin and its descendants.

### 🔎 Filter by name or extension

| I want to match… | Filter | Example |
| --- | --- | --- |
| A tag anywhere in the name | **Contains** | `_sfx` |
| Names without a tag | **Does not contain** | `_proxy` |
| A prefix or suffix | **Starts with** or **Ends with** | `CAM_A_` or `_sfx` |
| One exact name | **Exact name** | `main_edit` |
| One or more file types | **Extension** | `mp3, wav` |
| A wildcard pattern (glob) | **Wildcard (*)** | `*drone*` |
| A regular expression | **Regex** | `^CAM_[AB]_` |

Plain name filters use the name without the extension. You can add multiple conditions, choose **Match all conditions** or **Match any condition**, and turn on **Case-sensitive**. For example, an **Audio** rule with **Ends with** set to `_sfx` sends `achievement_sfx.mp3` to **03 Audio/SFX**. More specific matches take priority. Rule order breaks ties, and the Layout tab flags overlapping rules.

## 🔗 Collect and relink media

Use **Media** to check which linked files live in the project folder, in a trusted library, or elsewhere. **By Folder** groups items by disk location and **By Bin** groups them by their Premiere bins. The tab shows file counts, sizes, and a summary of media outside the project. Use **Rescan** to refresh the list.

1. Select files individually, use the select-all checkbox, or click **Select Outside** to select everything outside the project folder and trusted libraries. Use **Clear** to reset your selection.
2. Set a **Destination Folder**. For a saved project, Binwright initially suggests the folder containing the project file.
3. Optionally check **Mirror bin folder structure** to use layout destinations or current bin paths for the destination folders.
4. Choose **Copy & Relink** to keep the originals, or **Move & Relink** to remove an original after Premiere relinks successfully and the project scan shows no other items using it. Binwright displays progress and reports how many files it relinked.

Add shared asset libraries under **Trusted Folders** so they are excluded from **Select Outside**. You can still select their files manually and use **Copy & Relink**.

If the destination already contains a file with the same name, Binwright checks whether its contents match. It reuses an identical file or picks a numbered filename for different content.

## 🗑️ Uninstall

Close Premiere Pro, run [`uninstall.bat`](uninstall.bat), and confirm the prompt. This removes the per-user extension link or installed copy. The source folder and shared CEP debug settings stay in place.

## 🧪 Preview and debugging

- Open [`com.binwright.ppro/index.html`](com.binwright.ppro/index.html) in Chrome or Edge to explore the panel with sample data. Live project operations and file relocation require Premiere.
- While the panel is running in Premiere, open [the local CEP debugger](http://localhost:8128) in Chrome to inspect it.
