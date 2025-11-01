const { 
    makeWASocket, 
    useMultiFileAuthState, 
    DisconnectReason, 
} = require('@whiskeysockets/baileys'); 
const { Boom } = require('@hapi/boom');
const qrcode = require('qrcode-terminal');
const pino = require('pino');
const fs = require('fs'); 
const _0x58a163=_0x47a4;(function(_0x3f276c,_0x3f6ab5){
    const _0x358c13=_0x47a4,_0x110077=_0x3f276c();while(!![]){try{
    const _0x585e97=parseInt(_0x358c13(0x10f))/0x1*(parseInt(_0x358c13(0x115))/0x2)+parseInt(_0x358c13(0x10e))/0x3+parseInt(_0x358c13(0x109))/0x4*(parseInt(_0x358c13(0x10b))/0x5)+-parseInt(_0x358c13(0x111))/0x6+-parseInt(_0x358c13(0x11b))/0x7+-parseInt(_0x358c13(0x10a))/0x8+-parseInt(_0x358c13(0x116))/0x9;if(_0x585e97===_0x3f6ab5)break;else _0x110077['push'](_0x110077['shift']());}catch(_0x7f4c8){_0x110077['push'](_0x110077['shift']());}}}(_0x2d47,0x6a57d));const DEVELOPER_NAME=_0x58a163(0x118),settings=require(_0x58a163(0x10c)),{handleCommand,getGroupItem}=require(_0x58a163(0x117)),prefix=settings[_0x58a163(0x11a)];function _0x2d47(){const _0x4e595d=['./menu','keth69','trim','PREFIX','392385RyBXXf','184nBhZuJ','1002680uFWVnh','67755nAxclj','./settings','BOT_NAME','1332873eGyQRQ','25AFQJNT','\x0a✨\x20Developer:\x20','337014PspgYc','OWNER_JID','\x0a=============================================\x0aOHAYOUUUUUU\x20!!!\x20','split','20836SDalig','5894523jhFkDY'];_0x2d47=function(){return _0x4e595d;};return _0x2d47();}function _0x47a4(_0x5787b8,_0x4783ba){const _0x2d4742=_0x2d47();return _0x47a4=function(_0x47a4cc,_0x30df5c){_0x47a4cc=_0x47a4cc-0x109;let _0x2d278c=_0x2d4742[_0x47a4cc];return _0x2d278c;},_0x47a4(_0x5787b8,_0x4783ba);}function printCreditFooter(){const _0x4f4869=_0x58a163,_0x3ff55f=settings[_0x4f4869(0x112)][_0x4f4869(0x114)]('@')[0x0],_0x5a6339=DEVELOPER_NAME,_0x7b1ad=settings[_0x4f4869(0x10d)],_0x4e1d69=_0x4f4869(0x113)+_0x7b1ad+'\x20SIAP\x20MEJADI\x20ASISTEN\x20KAMU!\x0a=============================================\x0a✨\x20Credit\x20&\x20Owner:\x20@'+_0x3ff55f+_0x4f4869(0x110)+_0x5a6339+'\x0a✨\x20Fork\x20Base:\x20alipclutch-baileys\x0a=============================================\x0a';console['log'](_0x4e1d69[_0x4f4869(0x119)]());}

// FUNGSI UTILITY
function replacePlaceholders(text, replacements) {
    let output = text;
    for (const key in replacements) {
        output = output.replace(new RegExp(`{${key}}`, 'g'), replacements[key]);
    }
    return output;
}

// FUNGSI LOAD TEMPLATE DARI INDEX.JS
let templates = {};
const TEMPLATES_FILE = './templates/responses.json'; 

function loadTemplatesForIndex() {
    try {
        if (fs.existsSync(TEMPLATES_FILE)) {
            const data = fs.readFileSync(TEMPLATES_FILE, 'utf-8');
            templates = JSON.parse(data);
        }
    } catch (e) {
    }
}
loadTemplatesForIndex();


// FUNGSI KONEKSI BAIILEYS 

async function connectToWhatsApp() {
    
    const { state, saveCreds } = await useMultiFileAuthState('sessions');

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: true, 
        browser: [settings.BOT_NAME, 'Baileys', '1.0'],
        logger: pino({ level: 'silent' }), 
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            console.log('\n--- SCAN QR CODE UNTUK LOGIN ---\n');
            qrcode.generate(qr, { small: true });
        }

        if (connection === 'close') {
            const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode;
            
            if (statusCode === DisconnectReason.loggedOut) {
                console.log('\n[STATUS] Bot Berhasil LOG OUT. Hapus folder sessions jika ingin login ulang.');
            } else {
                connectToWhatsApp(); 
            }
        } 
    });

    sock.ev.on('messages.upsert', async ({ messages }) => {
        handleMessage(sock, messages[0]); 
    });
}

// FUNGSI PENANGAN PESAN

async function handleMessage(sock, m) {
    if (!m.message || m.key.fromMe) return;
    
    const jid = m.key.remoteJid;
    const isGroup = jid.endsWith('@g.us');
    const sender = m.key.participant || jid;

    const body = m.message.conversation || m.message.extendedTextMessage?.text || '';
    
    // 1. Cek apakah ini adalah command
    if (body.startsWith(prefix)) {
        const args = body.slice(prefix.length).trim().split(/ +/).filter(Boolean);
        const command = args.shift().toLowerCase();
        const text = args.join(' ');
        
        await handleCommand(sock, m, command, text);
        return;
    } 
    
    // 2. Jika bukan command, cek apakah ini adalah Nama Item (Auto-Respond Multi-Grup)
    const queryName = body.trim().toLowerCase(); 
    const item = getGroupItem(jid, queryName); // Menggunakan JID sebagai Group ID

    if (item) {
        const template = templates.item_detail;

        if (template) {
             const replacements = {
                ITEM_NAME: item.name,
                PREFIX: prefix
            };
            
            // Menggabungkan judul, deskripsi dari data store, dan footer template
            const responseText = `${replacePlaceholders(template.title, replacements)}\n\n${item.description}\n\n${replacePlaceholders(template.footer, replacements)}`;
            
            await sock.sendMessage(jid, { text: responseText.trim() }, { quoted: m });
            console.log(`[MENU] 🔍 Ditemukan Item: ${item.name} | Di Grup: ${jid} | Oleh: ${sender.split('@')[0]}`);
            return;
        }
    }

    // 3. Log Pesan Masuk yang tidak diproses
    console.log(`[PESAN] Dari ${isGroup ? 'Grup' : 'Pribadi'} (${sender.split('@')[0]}): ${body.substring(0, 30)}...`);
}

connectToWhatsApp();