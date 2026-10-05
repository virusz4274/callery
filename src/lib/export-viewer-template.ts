import { VIEWER_HTML_SCRIPT } from './export-viewer-template-script';

export const VIEWER_HTML = `
<!DOCTYPE html>
<html lang="en" class="dark">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Call Organizer Export Viewer</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script>
        tailwind.config = {
            darkMode: 'class',
            theme: {
                extend: {
                    colors: {
                        primary: '#3b82f6',
                        background: '#09090b',
                        surface: '#18181b',
                        border: '#27272a',
                    }
                }
            }
        }
    </script>
    <style>
        body { background-color: #09090b; color: #e4e4e7; font-family: system-ui, sans-serif; }
        .scrollbar-hide::-webkit-scrollbar { display: none; }
    </style>
</head>
<body class="h-screen flex flex-col overflow-hidden">
    <!-- Header -->
    <header class="border-b border-border bg-surface/50 backdrop-blur p-4 flex items-center justify-between">
        <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-full bg-primary flex items-center justify-center font-bold text-white">V</div>
            <h1 class="font-bold text-lg">Call Organizer Export</h1>
        </div>
        <div class="flex items-center gap-4">
            <input type="text" id="searchInput" placeholder="Search recordings..." class="bg-background border border-border rounded-lg px-3 py-1.5 text-sm w-64 focus:outline-none focus:border-primary">
            <button onclick="document.getElementById('folderInput').click()" class="bg-primary hover:bg-primary/90 text-white px-4 py-2 rounded-lg text-sm font-medium transition">
                Load 'Contacts' Folder
            </button>
            <input type="file" id="folderInput" webkitdirectory directory multiple class="hidden" onchange="handleFolderSelect(event)">
        </div>
    </header>

    <!-- Main Content -->
    <div class="flex-1 flex overflow-hidden">
        <!-- Sidebar -->
        <aside class="w-80 border-r border-border bg-surface/30 flex flex-col">
            <div class="p-3 border-b border-border">
                <h2 class="text-xs font-semibold text-gray-500 uppercase tracking-wider">Contacts</h2>
            </div>
            <div id="contactList" class="flex-1 overflow-y-auto p-2 space-y-1">
                <!-- Contacts injected here -->
                <div class="text-center p-4 text-gray-500 text-sm">Load folder to view contacts</div>
            </div>
        </aside>

        <!-- Recording List -->
        <main class="flex-1 flex flex-col min-w-0">
             <div class="p-4 border-b border-border flex justify-between items-center">
                <h2 id="currentContext" class="font-bold text-xl">All Recordings</h2>
                <span id="recordingCount" class="text-sm text-gray-500">0 items</span>
            </div>
            <div id="recordingList" class="flex-1 overflow-y-auto p-4 space-y-2">
                <!-- Recordings injected here -->
                 <div class="h-full flex flex-col items-center justify-center text-gray-500 space-y-4">
                    <p class="text-lg">Select the extracted "Contacts" folder to begin.</p>
                </div>
            </div>
        </main>

        <!-- Transcription Panel -->
        <aside class="w-96 border-l border-border bg-surface/30 flex flex-col hidden" id="detailPanel">
            <div class="p-4 border-b border-border">
                  <h3 class="font-bold text-lg" id="detailName">Recording</h3>
                  <p class="text-sm text-gray-400" id="detailMeta">Details</p>
            </div>
            <div class="flex-1 overflow-y-auto p-4 space-y-4 font-mono text-sm leading-relaxed" id="transcriptContainer">
                <!-- Transcript -->
            </div>
            <div class="p-4 border-t border-border bg-surface">
                <audio id="audioPlayer" controls class="w-full"></audio>
            </div>
        </aside>
    </div>

    <script>${VIEWER_HTML_SCRIPT}</script>
</body>
</html>
`;
