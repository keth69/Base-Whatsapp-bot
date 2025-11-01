// menu.js

const fs = require('fs');
// Hapus Jimp, karena digantikan wa-sticker-formatter
const { downloadContentFromMessage } = require('@whiskeysockets/baileys'); 
const { Sticker } = require('wa-sticker-formatter'); // <-- LIBRARY STIKER BARU

// Impor pengaturan dari settings.js
const settings = require('./settings');
const prefix = settings.PREFIX;

// --- KONFIGURASI DATA STORE & TEMPLATE ---
const MENU_FILE = './database/menu_data.json';
const OWNERS_FILE = './database/owners.json';
const TEMPLATES_FILE = './templates/responses.json'; 
const GROUP_JIDS_FILE = './database/group_jids.json'; 

let globalMenuStore = {}; 
let secondaryOwners = [];
let templates = {}; 
let groupJids = []; 

// --- FUNGSI UTILITY GLOBAL ---

function replacePlaceholders(text, replacements) {
    let output = text;
    for (const key in replacements) {
        output = output.replace(new RegExp(`{${key}}`, 'g'), replacements[key]);
    }
    return output;
}

// --- FUNGSI DATA STORE (LOADERS & SAVERS) ---

function loadTemplates() {
    try {
        if (fs.existsSync(TEMPLATES_FILE)) {
            const data = fs.readFileSync(TEMPLATES_FILE, 'utf-8');
            templates = JSON.parse(data);
        } else {
            templates = {}; 
        }
    } catch (e) {
        templates = {};
    }
}

function loadMenuData() {
    try {
        if (fs.existsSync(MENU_FILE)) {
            const data = fs.readFileSync(MENU_FILE, 'utf-8');
            globalMenuStore = JSON.parse(data);
        } else {
            globalMenuStore = {};
            if (!fs.existsSync('./database')) fs.mkdirSync('./database');
            saveMenuData(); 
        }
    } catch (e) {
        globalMenuStore = {};
    }
}

function saveMenuData() {
    try {
        fs.writeFileSync(MENU_FILE, JSON.stringify(globalMenuStore, null, 2));
    } catch (e) {
        console.error('[STORE] Gagal menyimpan data menu.');
    }
}

function loadOwnersData() {
    try {
        if (fs.existsSync(OWNERS_FILE)) {
            const data = fs.readFileSync(OWNERS_FILE, 'utf-8');
            secondaryOwners = JSON.parse(data).map(jid => jid.replace(/[^0-9]/g, '') + '@s.whatsapp.net'); 
        } else {
            secondaryOwners = [];
            if (!fs.existsSync('./database')) fs.mkdirSync('./database');
            saveOwnersData(); 
        }
    } catch (e) {
        secondaryOwners = [];
    }
}

function saveOwnersData() {
    try {
        const simplifiedOwners = secondaryOwners.map(jid => jid.split('@')[0]);
        fs.writeFileSync(OWNERS_FILE, JSON.stringify(simplifiedOwners, null, 2));
    } catch (e) {
        console.error('[STORE] Gagal menyimpan data owner.');
    }
}

function loadGroupJids() {
    try {
        if (fs.existsSync(GROUP_JIDS_FILE)) {
            const data = fs.readFileSync(GROUP_JIDS_FILE, 'utf-8');
            groupJids = JSON.parse(data);
        } else {
            groupJids = [];
            if (!fs.existsSync('./database')) fs.mkdirSync('./database');
            saveGroupJids(); 
        }
    } catch (e) {
        console.error('[GROUP JIDS] Gagal memuat/parse JID grup.');
        groupJids = [];
    }
}

function saveGroupJids() {
    try {
        fs.writeFileSync(GROUP_JIDS_FILE, JSON.stringify(groupJids, null, 2));
    } catch (e) {
        console.error('[GROUP JIDS] Gagal menyimpan JID grup.');
    }
}

loadTemplates(); 
loadMenuData(); 
loadOwnersData(); 
loadGroupJids(); 

// --- FUNGSI GETTER UNTUK MULTI-GRUP ---

function getGroupMenu(groupId) {
    if (!globalMenuStore[groupId]) {
        globalMenuStore[groupId] = {}; 
    }
    return globalMenuStore[groupId];
}

function getGroupItem(groupId, itemNameKey) {
    const menu = getGroupMenu(groupId);
    return menu[itemNameKey];
}

// --- FUNGSI UTILITY (Pengecekan Owner/Admin) ---

function isPrimaryOwner(senderJid) {
    return senderJid.includes(settings.OWNER_JID.split('@')[0]);
}

async function isOwnerOrAdmin(senderJid, isGroup, groupId, sock) {
    // 1. Cek Primary/Secondary Owner
    if (isPrimaryOwner(senderJid)) return true;
    if (secondaryOwners.includes(senderJid)) return true;

    // 2. Cek Group Admin (Hanya berlaku di grup)
    if (isGroup) {
        try {
            const groupMetadata = await sock.groupMetadata(groupId);
            
            // Cek apakah BOT adalah Admin grup ini (penting untuk izin read metadata)
            const botId = sock.user.id;
            const botParticipant = groupMetadata.participants.find(p => p.id === botId);
            
            if (!botParticipant || (botParticipant.admin !== 'admin' && botParticipant.admin !== 'superadmin')) {
                return false; 
            }

            // Jika bot Admin, cek status pengirim. Menggunakan !!participant.admin untuk fleksibilitas.
            const participant = groupMetadata.participants.find(p => p.id === senderJid);
            return participant && !!participant.admin; 
            
        } catch (error) {
            return false;
        }
    }
    
    return false;
}

// --- FUNGSI LOGIKA COMMAND ---

async function handleCommand(sock, m, command, text) {
    
    const jid = m.key.remoteJid;
    const isGroup = jid.endsWith('@g.us');
    const sender = m.key.participant || jid;
    const groupId = jid; 

    const replacements = {
        PREFIX: prefix,
        BOT_NAME: settings.BOT_NAME
    };

    // --- LOGIKA PENYIMPANAN JID GRUP SECARA OTOMATIS ---
    if (isGroup && !groupJids.includes(jid)) {
        groupJids.push(jid);
        saveGroupJids();
    }
    // --------------------------------------------------

    // ===================================
    // 1. FITUR MENU UTAMA (.menu)
    // ===================================
    if (command === 'menu') {
        const template = templates.menu_utama;
        if (template) {
            const menuText = `${replacePlaceholders(template.title, replacements)}\n\n${replacePlaceholders(template.body, replacements)}`;
            await sock.sendMessage(jid, { text: menuText.trim() }, { quoted: m });
        }
        return true; 
    }
    
    // ===================================
    // 2. SUPER OWNER MENU (.ownermenu)
    // ===================================
    if (command === 'ownermenu') {
        if (!isPrimaryOwner(sender)) {
             await sock.sendMessage(jid, { text: '❌ Perintah ini hanya dapat digunakan oleh *Primary Owner Bot*.' }, { quoted: m });
             return true;
        }

        const template = templates.owner_menu;
        if (template) {
            const menuText = `${replacePlaceholders(template.title, replacements)}\n\n${replacePlaceholders(template.body, replacements)}`;
            await sock.sendMessage(jid, { text: menuText.trim() }, { quoted: m });
        }
        return true;
    }

    // ===================================
    // 3. LOGIKA COMMAND SUPER OWNER (Owners & Broadcast)
    // ===================================

    if (['addowner', 'delowner', 'showowners', 'brat', 'bratvid'].includes(command)) {
        if (!isPrimaryOwner(sender)) {
             await sock.sendMessage(jid, { text: '❌ Perintah ini hanya dapat digunakan oleh *Primary Owner Bot*.' }, { quoted: m });
             return true;
        }

        if (command === 'addowner') {
            const number = text.replace(/[^0-9]/g, '');
            const targetJid = number + '@s.whatsapp.net';

            if (number.length < 5) {
                await sock.sendMessage(jid, { text: `❌ Format salah. Masukkan nomor yang valid. Contoh: *${prefix}addowner 6281234...*.` }, { quoted: m });
                return true;
            }

            if (isPrimaryOwner(targetJid)) {
                 await sock.sendMessage(jid, { text: `❌ Nomor tersebut sudah terdaftar sebagai Primary Owner.` }, { quoted: m });
                 return true;
            }

            if (secondaryOwners.includes(targetJid)) {
                await sock.sendMessage(jid, { text: `❌ Owner *${number}* sudah ada dalam daftar owner tambahan.` }, { quoted: m });
                return true;
            }

            secondaryOwners.push(targetJid);
            saveOwnersData();
            await sock.sendMessage(jid, { text: `✅ Owner tambahan *${number}* berhasil ditambahkan.` }, { quoted: m });
            return true;
        
        } else if (command === 'delowner') {
            const number = text.replace(/[^0-9]/g, '');
            const targetJid = number + '@s.whatsapp.net';
            
            if (number.length < 5) {
                await sock.sendMessage(jid, { text: `❌ Format salah. Masukkan nomor yang valid. Contoh: *${prefix}delowner 6281234...*.` }, { quoted: m });
                return true;
            }

            if (isPrimaryOwner(targetJid)) {
                 await sock.sendMessage(jid, { text: `❌ Anda tidak bisa menghapus Primary Owner.` }, { quoted: m });
                 return true;
            }

            const initialLength = secondaryOwners.length;
            secondaryOwners = secondaryOwners.filter(ownerJid => ownerJid !== targetJid);

            if (secondaryOwners.length === initialLength) {
                await sock.sendMessage(jid, { text: `❌ Owner *${number}* tidak ditemukan dalam daftar owner tambahan.` }, { quoted: m });
                return true;
            }
            
            saveOwnersData();
            await sock.sendMessage(jid, { text: `🗑️ Owner tambahan *${number}* berhasil dihapus.` }, { quoted: m });
            return true;

        } else if (command === 'showowners') {
            let listText = `*--- DAFTAR OWNER BOT ${settings.BOT_NAME} ---*\n\n`;
            
            listText += `👑 *Primary Owner:*\n`;
            listText += `   @${settings.OWNER_JID.split('@')[0]}\n\n`;

            listText += `✨ *Owner Tambahan (${secondaryOwners.length} orang):*\n`;
            if (secondaryOwners.length > 0) {
                secondaryOwners.forEach((ownerJid, index) => {
                    listText += `   ${index + 1}. @${ownerJid.split('@')[0]}\n`;
                });
            } else {
                listText += '   _(Belum ada owner tambahan)_';
            }

            const mentions = [settings.OWNER_JID, ...secondaryOwners];
            
            await sock.sendMessage(jid, { 
                text: listText,
                mentions: mentions
            }, { quoted: m });
            return true;
        } 
        
        // --- FITUR: .brat (Broadcast Text) ---
        else if (command === 'brat') {
            if (!text) {
                await sock.sendMessage(jid, { text: `❌ Format salah. Gunakan: *${prefix}brat <pesan_broadcast>*.` }, { quoted: m });
                return true;
            }

            let sentCount = 0;
            for (const targetJid of groupJids) {
                try {
                    await sock.sendMessage(targetJid, { text: text });
                    sentCount++;
                    await new Promise(resolve => setTimeout(resolve, 1000)); 
                } catch (broadcastError) {
                    console.error(`[BROADCAST] Gagal mengirim pesan ke ${targetJid}: ${broadcastError.message}`);
                }
            }
            const responseText = replacePlaceholders(templates.broadcast_text_sent, { COUNT: sentCount });
            await sock.sendMessage(jid, { text: responseText }, { quoted: m });
            return true;
        }

        // --- FITUR: .bratvid (Broadcast Media) ---
        else if (command === 'bratvid') {
            let mediaMessage = m.message.imageMessage || m.message.videoMessage;
            if (m.message.extendedTextMessage && m.message.extendedTextMessage.contextInfo) {
                const quoted = m.message.extendedTextMessage.contextInfo.quotedMessage;
                mediaMessage = quoted?.imageMessage || quoted?.videoMessage;
            }

            if (!mediaMessage) {
                await sock.sendMessage(jid, { text: '❌ Balas gambar/video atau kirim gambar/video dengan caption ini untuk broadcast media.' }, { quoted: m });
                return true;
            }

            let sentCount = 0;
            const buffer = await downloadContentFromMessage(mediaMessage, mediaMessage.mimetype.includes('image') ? 'image' : 'video');
            let mediaBuffer = Buffer.from([]);
            for await (const chunk of buffer) {
                mediaBuffer = Buffer.concat([mediaBuffer, chunk]);
            }

            for (const targetJid of groupJids) {
                try {
                    if (mediaMessage.mimetype.includes('image')) {
                        await sock.sendMessage(targetJid, { image: mediaBuffer, caption: text || 'Broadcast dari ' + settings.BOT_NAME });
                    } else { // video
                        await sock.sendMessage(targetJid, { video: mediaBuffer, caption: text || 'Broadcast dari ' + settings.BOT_NAME });
                    }
                    sentCount++;
                    await new Promise(resolve => setTimeout(resolve, 1000));
                } catch (broadcastError) {
                    console.error(`[BROADCAST] Gagal mengirim media ke ${targetJid}: ${broadcastError.message}`);
                }
            }
            const responseText = replacePlaceholders(templates.broadcast_video_sent, { COUNT: sentCount });
            await sock.sendMessage(jid, { text: responseText }, { quoted: m });
            return true;
        }
    }

    // ===================================
    // 4. FITUR ADMIN/OWNER LAIN (Store Management)
    // ===================================
    if (command === 'storemenu' || ['addlist', 'updatelist', 'dellist'].includes(command)) {
        
        const hasAccess = await isOwnerOrAdmin(sender, isGroup, jid, sock);
        
        if (!hasAccess) {
             await sock.sendMessage(jid, { text: '❌ Perintah ini hanya dapat digunakan oleh *Admin Grup atau Owner Bot*.' }, { quoted: m });
             return true;
        }
        
        // --- Logika .storemenu ---
        if (command === 'storemenu') {
            const template = templates.store_menu;
            if (template) {
                 const storeMenu = `${replacePlaceholders(template.title, replacements)}\n\n${replacePlaceholders(template.body, replacements)}`;
                 await sock.sendMessage(jid, { text: storeMenu.trim() }, { quoted: m });
            }
            return true;
        }

        // --- Logika .addlist (MULTI-GRUP) ---
        if (command === 'addlist') {
            if (!text.includes('|') || text.split('|').length < 2) {
                await sock.sendMessage(jid, { text: `❌ Format salah. Gunakan: *${prefix}addlist <nama>|<deskripsi>*.` }, { quoted: m });
                return true;
            }

            const menu = getGroupMenu(groupId);
            const [name, ...descParts] = text.split('|').map(s => s.trim());
            const description = descParts.join('|').trim();
            const keyName = name.toLowerCase(); 

            if (!name || !description) {
                await sock.sendMessage(jid, { text: `❌ Nama item dan Deskripsi tidak boleh kosong!` }, { quoted: m });
                return true;
            }
            
            if (menu[keyName]) {
                await sock.sendMessage(jid, { text: `❌ Item *${name}* sudah ada di list grup ini. Gunakan *${prefix}updatelist* jika ingin mengubahnya.` }, { quoted: m });
                return true;
            }

            menu[keyName] = {
                name: name, 
                description: description 
            };
            saveMenuData();
            await sock.sendMessage(jid, { text: `✅ Item berhasil ditambahkan ke list grup ini:\n*Nama:* ${name}\n*Deskripsi:* ${description}` }, { quoted: m });
            return true;
        
        // --- Logika .updatelist (MULTI-GRUP) ---
        } else if (command === 'updatelist') {
            if (!text.includes('|') || text.split('|').length < 2) {
                await sock.sendMessage(jid, { text: `❌ Format salah. Gunakan: *${prefix}updatelist <nama>|<deskripsi_baru>*.` }, { quoted: m });
                return true;
            }
            
            const menu = getGroupMenu(groupId);
            const [name, ...descParts] = text.split('|').map(s => s.trim());
            const newDescription = descParts.join('|').trim();
            const keyName = name.toLowerCase(); 
            
            if (!menu[keyName]) {
                await sock.sendMessage(jid, { text: `❌ Item *${name}* tidak ditemukan di list grup ini.` }, { quoted: m });
                return true;
            }

            menu[keyName].description = newDescription;
            saveMenuData();
            await sock.sendMessage(jid, { text: `✅ Deskripsi untuk *${name}* berhasil diubah menjadi:\n*${newDescription}*` }, { quoted: m });
            return true;
        
        // --- Logika .dellist (MULTI-GRUP) ---
        } else if (command === 'dellist') {
            const menu = getGroupMenu(groupId);
            const nameToDelete = text.trim().toLowerCase();
            const originalName = menu[nameToDelete]?.name;
            
            if (!nameToDelete) {
                await sock.sendMessage(jid, { text: `❌ Masukkan Nama item yang ingin dihapus. Contoh: *${prefix}dellist Jeruk*.` }, { quoted: m });
                return true;
            }

            if (!menu[nameToDelete]) {
                await sock.sendMessage(jid, { text: `❌ Item *${text.trim()}* tidak ditemukan di list grup ini.` }, { quoted: m });
                return true;
            }
            
            delete menu[nameToDelete]; 
            saveMenuData();

            await sock.sendMessage(jid, { text: `🗑️ Item berhasil dihapus dari list grup ini:\n*Nama:* ${originalName}` }, { quoted: m });
            return true;
        }
    }

    // ===================================
    // 5. LOGIKA COMMAND UMUM (list, tagall, stiker)
    // ===================================
    else if (command === 'list') {
        const menu = getGroupMenu(groupId);
        const totalItems = Object.keys(menu).length;

        if (totalItems === 0) {
            await sock.sendMessage(jid, { text: '📄 Daftar Menu grup ini masih kosong. Mohon Admin Grup/Owner untuk mengisi daftar.' }, { quoted: m });
            return true;
        }
        
        const listTemplate = templates.list_menu;
        let listBody = '';
        
        for (const key in menu) {
            const item = menu[key];
            listBody += `*• ${item.name}*\n`; 
        }

        const listText = `${replacePlaceholders(listTemplate.title, replacements)}\n\n${listBody}${replacePlaceholders(listTemplate.footer, { TOTAL_ITEMS: totalItems })}`;
        
        await sock.sendMessage(jid, { text: listText }, { quoted: m });
        return true;
    
    } else if (command === 'tagall') {
        if (!isGroup) {
            await sock.sendMessage(jid, { text: 'Perintah ini hanya bisa digunakan di dalam Grup.' }, { quoted: m });
            return true;
        }
        
        const metadata = await sock.groupMetadata(jid);
        const members = metadata.participants.map(p => p.id);
        const tagallTitle = replacePlaceholders(templates.tagall_title, { TOTAL_MEMBERS: members.length });
        
        let mentionText = tagallTitle;
        
        members.forEach((member) => {
             mentionText += `@${member.split('@')[0]}\n`; 
        });

        await sock.sendMessage(jid, { 
            text: mentionText,
            mentions: members 
        }, { quoted: m });
        return true;
    } 
    
    // --- FITUR: .stiker / .s (MENGGUNAKAN wa-sticker-formatter) ---
    else if (command === 'stiker' || command === 's') {
        let mediaMessage = m.message.imageMessage || m.message.videoMessage;
        
        if (m.message.extendedTextMessage && m.message.extendedTextMessage.contextInfo) {
            const quoted = m.message.extendedTextMessage.contextInfo.quotedMessage;
            mediaMessage = quoted?.imageMessage || quoted?.videoMessage;
        }

        if (!mediaMessage) {
            await sock.sendMessage(jid, { text: '❌ Balas gambar/video atau kirim gambar/video dengan caption *' + prefix + 'stiker*.' }, { quoted: m });
            return true;
        }

        await sock.sendMessage(jid, { text: '⏳ Sedang memproses dan menambahkan metadata stiker...' }, { quoted: m });

        try {
            const buffer = await downloadContentFromMessage(mediaMessage, mediaMessage.mimetype.includes('image') ? 'image' : 'video');
            let mediaBuffer = Buffer.from([]);
            for await (const chunk of buffer) {
                mediaBuffer = Buffer.concat([mediaBuffer, chunk]);
            }

            // BUAT STIKER DENGAN LIBRARY WA-STICKER-FORMATTER
            const sticker = new Sticker(mediaBuffer, {
                pack: settings.BOT_NAME, 
                author: sender.split('@')[0], 
                type: mediaMessage.mimetype.includes('image') ? 'full' : 'flat', 
                quality: 100,
            });

            const stickerBuffer = await sticker.toBuffer();
            
            await sock.sendMessage(jid, { sticker: stickerBuffer }, { quoted: m });
            return true;
        } catch (error) {
            console.error('[STICKER] Gagal membuat stiker:', error);
            await sock.sendMessage(jid, { 
                text: '❌ Gagal membuat stiker. Kemungkinan:\n1. FFmpeg tidak terinstal (untuk video/GIF).\n2. Ukuran file terlalu besar.\n3. Format gambar/video tidak didukung.' 
            }, { quoted: m });
            return true;
        }
    }

    return false; // Command tidak dikenal
}

module.exports = {
    handleCommand,
    getGroupItem 
};