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

    <script>
        let db = { recordings: [], contacts: {} };

        async function handleFolderSelect(event) {
            const files = Array.from(event.target.files);
            console.log('Loaded files:', files.length);
            
            db = { recordings: [], contacts: {} };
            
            // Process files
            // Logic: Parse path "Contacts/Name/Year/Month/file"
            // We need to match .json files with audio files
            
            const jsonFiles = files.filter(f => f.name.endsWith('.json'));
            const audioFiles = files.filter(f => f.name.match(/\.(m4a|mp3|wav)$/));
            
            console.log('JSONs:', jsonFiles.length, 'Audios:', audioFiles.length);

            const audioMap = new Map();
            audioFiles.forEach(f => audioMap.set(f.webkitRelativePath.split('.').slice(0, -1).join('.'), f));

            for (const jsonFile of jsonFiles) {
                try {
                    const text = await readFile(jsonFile);
                    const data = JSON.parse(text);
                    
                    // Construct ID from path without extension
                    const basePath = jsonFile.webkitRelativePath.split('.').slice(0, -1).join('.');
                    const audioFile = audioMap.get(basePath);
                    
                    if (audioFile) {
                        const rec = {
                            ...data,
                            audioUrl: URL.createObjectURL(audioFile),
                            // Extract path info
                            path: jsonFile.webkitRelativePath
                        };
                        db.recordings.push(rec);
                        
                        // Index by Contact
                        const contactName = rec.contactName || rec.phoneNumber || 'Unknown';
                        if (!db.contacts[contactName]) db.contacts[contactName] = [];
                        db.contacts[contactName].push(rec);
                    }
                } catch (e) {
                    console.error('Error parsing', jsonFile.name, e);
                }
            }
            
            db.recordings.sort((a,b) => new Date(b.recordedAt) - new Date(a.recordedAt));
            renderContacts();
            renderRecordings(db.recordings);
        }

        function readFile(file) {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = e => resolve(e.target.result);
                reader.onerror = reject;
                reader.readAsText(file);
            });
        }

        function renderContacts() {
            const list = document.getElementById('contactList');
            list.innerHTML = '';
            
            // All Button
            const allBtn = document.createElement('button');
            allBtn.className = 'w-full text-left px-3 py-2 rounded hover:bg-white/5 text-sm font-medium';
            allBtn.textContent = \`All Recordings (\${db.recordings.length})\`;
            allBtn.onclick = () => renderRecordings(db.recordings);
            list.appendChild(allBtn);

            Object.keys(db.contacts).sort().forEach(name => {
                const btn = document.createElement('button');
                btn.className = 'w-full text-left px-3 py-2 rounded hover:bg-white/5 text-sm truncate';
                btn.textContent = \`\${name} (\${db.contacts[name].length})\`;
                btn.onclick = () => {
                   document.getElementById('currentContext').textContent = name;
                   renderRecordings(db.contacts[name]);
                };
                list.appendChild(btn);
            });
        }

        function renderRecordings(recordings) {
            const list = document.getElementById('recordingList');
            list.innerHTML = '';
            document.getElementById('recordingCount').textContent = \`\${recordings.length} items\`;

            recordings.forEach(rec => {
                const el = document.createElement('div');
                el.className = 'p-4 rounded-lg bg-surface hover:bg-surface/80 border border-border cursor-pointer transition flex justify-between items-center';
                const date = new Date(rec.recordedAt).toLocaleString();
                const dur = formatDuration(rec.duration);
                
                el.innerHTML = \`
                    <div>
                        <div class="font-medium text-blue-400">\${rec.contactName || rec.phoneNumber}</div>
                        <div class="text-xs text-gray-500">\${date}</div>
                    </div>
                    <div class="text-sm font-mono text-gray-400">\${dur}</div>
                \`;
                el.onclick = () => openDetail(rec);
                list.appendChild(el);
            });
        }

        function openDetail(rec) {
            const panel = document.getElementById('detailPanel');
            panel.classList.remove('hidden');
            
            document.getElementById('detailName').textContent = rec.contactName || rec.phoneNumber;
            document.getElementById('detailMeta').textContent = new Date(rec.recordedAt).toLocaleString();
            
            const player = document.getElementById('audioPlayer');
            player.src = rec.audioUrl;
            
            const tContainer = document.getElementById('transcriptContainer');
            tContainer.innerHTML = '';
            
            if (rec.fullTranscript) {
                rec.fullTranscript.forEach(seg => {
                    const div = document.createElement('div');
                    div.className = 'mb-2 hover:bg-white/5 p-1 rounded cursor-pointer';
                    div.innerHTML = \`<span class="text-blue-500 font-bold text-xs select-none">[\${seg.speakerId}]</span> <span class="text-gray-300">\${seg.text}</span>\`;
                    div.onclick = () => {
                         if (seg.words && seg.words[0]) {
                             player.currentTime = seg.words[0].start;
                             player.play();
                         }
                    };
                    tContainer.appendChild(div);
                });
            } else {
                tContainer.innerHTML = '<div class="text-gray-500 italic">No transcript available</div>';
            }
        }

        function formatDuration(sec) {
            const m = Math.floor(sec / 60);
            const s = Math.floor(sec % 60);
            return \`\${m}:\${s.toString().padStart(2, '0')}\`;
        }

        // Search
        document.getElementById('searchInput').addEventListener('input', (e) => {
            const q = e.target.value.toLowerCase();
            if (!q) {
                renderRecordings(db.recordings);
                return;
            }
            const filtered = db.recordings.filter(r => 
                (r.contactName?.toLowerCase().includes(q)) ||
                (r.phoneNumber?.includes(q)) ||
                (r.fullTranscript?.some(t => t.text.toLowerCase().includes(q)))
            );
            renderRecordings(filtered);
        });
    </script>
</body>
</html>
`;
