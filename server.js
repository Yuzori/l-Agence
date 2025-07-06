const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const cors = require('cors');
const multer = require('multer');
const http = require('http'); // Required for Socket.IO
const { Server } = require('socket.io'); // Socket.IO server

const app = express();
const server = http.createServer(app); // Create HTTP server for Express and Socket.IO
const io = new Server(server, {
    cors: {
        origin: "*", // Allow all origins for development
        methods: ["GET", "POST", "PUT", "DELETE"]
    }
});

const PORT = 3000;

// --- Configuration CORS ---
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// --- Middlewares intégrés d'Express ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- Configuration Multer pour l'upload de fichiers ---
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const storage = multer.diskStorage({
    destination: async (req, file, cb) => {
        try {
            await fs.mkdir(UPLOADS_DIR, { recursive: true });
            cb(null, UPLOADS_DIR);
        } catch (err) {
            console.error(`Erreur lors de la création du dossier d'uploads (${UPLOADS_DIR}):`, err);
            cb(err);
        }
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

// --- Chemins des fichiers de données JSON ---
const DATA_DIR = path.join(__dirname, 'data');
const AGENTS_FILE = path.join(DATA_DIR, 'agents.json');
const DOSSIERS_FILE = path.join(DATA_DIR, 'dossiers.json');
const NOTIFICATIONS_FILE = path.join(DATA_DIR, 'notifications.json');
const MESSAGES_FILE = path.join(DATA_DIR, 'messages.json');

// --- Fonctions utilitaires pour la lecture/écriture de JSON ---
async function readJsonFile(filePath, defaultContent = null) {
    try {
        const data = await fs.readFile(filePath, 'utf8');
        if (data.trim() === '') {
            return defaultContent;
        }
        return JSON.parse(data);
    } catch (error) {
        if (error.code === 'ENOENT') {
            return defaultContent;
        }
        if (error instanceof SyntaxError) {
            console.error(`Erreur de syntaxe JSON dans le fichier ${filePath}:`, error);
            throw new Error(`Fichier JSON corrompu: ${filePath}. Veuillez le vérifier ou le supprimer.`);
        }
        console.error(`Erreur lors de la lecture du fichier JSON ${filePath}:`, error);
        throw error;
    }
}

async function writeJsonFile(filePath, data) {
    try {
        await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
    } catch (error) {
        console.error(`Erreur lors de l'écriture du fichier JSON ${filePath}:`, error);
        throw error;
    }
}

// --- Fonction d'initialisation des fichiers au démarrage ---
async function initializeDataFiles() {
    try {
        await fs.mkdir(DATA_DIR, { recursive: true });

        let agents = await readJsonFile(AGENTS_FILE, { agents: [] });
        if (!agents || !Array.isArray(agents.agents) || agents.agents.length === 0) {
            console.log("Initialisation: agents.json est vide ou corrompu. Création des agents par défaut.");
            agents = { agents: [
                { "name": "Omar", "code": "12345678" },
                { "name": "Achraf", "code": "12345678" },
                { "name": "Assane Diop", "code": "12345678" }
            ]};
            await writeJsonFile(AGENTS_FILE, agents);
        } else {
            console.log("Initialisation: agents.json trouvé.");
        }

        let dossiers = await readJsonFile(DOSSIERS_FILE, { dossiers: [] });
        if (!dossiers || !Array.isArray(dossiers.dossiers)) {
            console.log("Initialisation: dossiers.json est vide ou corrompu. Création d'un tableau de dossiers vide.");
            dossiers = { dossiers: [] };
            await writeJsonFile(DOSSIERS_FILE, dossiers);
        } else {
            console.log("Initialisation: dossiers.json trouvé.");
        }

        let notifications = await readJsonFile(NOTIFICATIONS_FILE, { notifications: [] });
        if (!notifications || !Array.isArray(notifications.notifications)) {
            console.log("Initialisation: notifications.json est vide ou corrompu. Création d'un tableau de notifications vide.");
            notifications = { notifications: [] };
            await writeJsonFile(NOTIFICATIONS_FILE, notifications);
        } else {
            console.log("Initialisation: notifications.json trouvé.");
        }

        let messagesData = await readJsonFile(MESSAGES_FILE, { contacts: [], conversations: [] });
        if (!messagesData || !Array.isArray(messagesData.contacts) || !Array.isArray(messagesData.conversations)) {
            console.log("Initialisation: messages.json est vide ou corrompu. Création de structures de messagerie par défaut.");
            messagesData = { contacts: [], conversations: [] };
            await writeJsonFile(MESSAGES_FILE, messagesData);
        } else {
            console.log("Initialisation: messages.json trouvé.");
        }
        
        console.log("Initialisation des fichiers de données terminée.");
    } catch (error) {
        console.error("ERREUR CRITIQUE AU DÉMARRAGE: Impossible d'initialiser les fichiers de données. Vérifiez les permissions du dossier:", error);
        process.exit(1);
    }
}

// --- Serve static files (frontend) ---
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOADS_DIR));

// --- API Routes ---

// Agents
app.get('/api/agents', async (req, res) => {
    try {
        const data = await readJsonFile(AGENTS_FILE);
        if (!data || !Array.isArray(data.agents)) {
            console.error("agents.json est invalide lors d'une requête GET /api/agents.");
            return res.status(500).json({ message: "Erreur serveur: données des agents invalides." });
        }
        res.json(data.agents);
    } catch (error) {
        console.error("Erreur API GET /api/agents:", error);
        res.status(500).json({ message: "Erreur lors de la récupération des agents." });
    }
});

// Dossiers
app.get('/api/dossiers', async (req, res) => {
    try {
        const data = await readJsonFile(DOSSIERS_FILE);
        if (!data || !Array.isArray(data.dossiers)) {
            console.error("dossiers.json est invalide ou vide lors d'une requête GET /api/dossiers.");
            return res.status(200).json([]); 
        }
        res.json(data.dossiers);
    } catch (error) {
        console.error("Erreur API GET /api/dossiers:", error);
        res.status(500).json({ message: "Erreur lors de la récupération des dossiers." });
    }
});

app.post('/api/dossiers', upload.single('image'), async (req, res) => {
    try {
        const { title, desc, author } = req.body;
        const isHidden = req.body.isHidden === 'true' || false; 
        const imageHidden = req.body.imageHidden === 'true' || false;
        const imagePath = req.file ? `/uploads/${req.file.filename}` : null;

        if (!title || !desc || !author) {
            if (req.file) { await fs.unlink(req.file.path); }
            return res.status(400).json({ message: "Titre, description et auteur sont requis." });
        }

        let data = await readJsonFile(DOSSIERS_FILE);
        let dossiers = (data && Array.isArray(data.dossiers)) ? data.dossiers : [];

        const newDossier = {
            id: Date.now(),
            title,
            desc,
            image: imagePath,
            author,
            comments: [],
            likes: [],
            dislikes: [],
            reposts: [],
            isHidden: isHidden,
            imageHidden: imageHidden
        };

        dossiers.unshift(newDossier);
        await writeJsonFile(DOSSIERS_FILE, { dossiers });
        
        // Notify all connected clients about the new post
        io.emit('new_dossier', newDossier);
        await createNotification("all", `${author} a posté un nouveau dossier : "${title}"`);

        res.status(201).json(newDossier);
    } catch (error) {
        console.error("Erreur API POST /api/dossiers:", error);
        res.status(500).json({ message: "Erreur lors de la création du dossier." });
    }
});

app.put('/api/dossiers/:id', upload.single('image'), async (req, res) => {
    try {
        const dossierId = parseInt(req.params.id);
        const { title, desc, author, isHidden, imageHidden, actionPerformer } = req.body;
        const newImageFile = req.file;

        let data = await readJsonFile(DOSSIERS_FILE);
        let dossiers = (data && Array.isArray(data.dossiers)) ? data.dossiers : [];

        const index = dossiers.findIndex(d => d.id === dossierId);
        if (index === -1) {
            if (newImageFile) { await fs.unlink(newImageFile.path); }
            return res.status(404).json({ message: "Dossier non trouvé." });
        }

        const currentDossier = dossiers[index];
        
        if (newImageFile && currentDossier.image) {
            const oldImagePath = path.join(__dirname, currentDossier.image);
            try { await fs.unlink(oldImagePath); } catch (unlinkError) {
                console.warn(`Impossible de supprimer l'ancienne image ${oldImagePath}:`, unlinkError);
            }
        }

        dossiers[index] = {
            ...currentDossier,
            title: title !== undefined ? title : currentDossier.title,
            desc: desc !== undefined ? desc : currentDossier.desc,
            image: newImageFile ? `/uploads/${newImageFile.filename}` : currentDossier.image,
            isHidden: isHidden === 'true', 
            imageHidden: imageHidden === 'true',
            author: author !== undefined ? author : currentDossier.author
        };

        await writeJsonFile(DOSSIERS_FILE, { dossiers });

        // Notify all connected clients about the updated post
        io.emit('update_dossier', dossiers[index]);

        // Notifications pour Assane Diop si c'est lui qui modifie/floute
        if (actionPerformer === "Assane Diop" && currentDossier.author !== "Assane Diop") {
            let notificationText = `L'Agence a modifié votre dossier : "${currentDossier.title}"`;
            if (isHidden !== undefined && isHidden === 'true' && !currentDossier.isHidden) { // Was not hidden, now is
                 notificationText = `L'Agence a masqué votre dossier : "${currentDossier.title}"`;
            } else if (isHidden !== undefined && isHidden === 'false' && currentDossier.isHidden) { // Was hidden, now shown
                notificationText = `L'Agence a ré-affiché votre dossier : "${currentDossier.title}"`;
            } else if (imageHidden !== undefined && imageHidden === 'true' && !currentDossier.imageHidden) { // Was not image-hidden, now is
                notificationText = `L'Agence a masqué l'image de votre dossier : "${currentDossier.title}"`;
            } else if (imageHidden !== undefined && imageHidden === 'false' && currentDossier.imageHidden) { // Was image-hidden, now shown
                notificationText = `L'Agence a ré-affiché l'image de votre dossier : "${currentDossier.title}"`;
            }
            await createNotification(currentDossier.author, notificationText, "admin_action", "Assane Diop");
        }


        res.status(200).json(dossiers[index]);
    } catch (error) {
        console.error("Erreur API PUT /api/dossiers/:id:", error);
        res.status(500).json({ message: "Erreur lors de la mise à jour du dossier." });
    }
});

app.delete('/api/dossiers/:id', async (req, res) => {
    try {
        const dossierId = parseInt(req.params.id);
        const { actionPerformer } = req.body;
        let data = await readJsonFile(DOSSIERS_FILE);
        let dossiers = (data && Array.isArray(data.dossiers)) ? data.dossiers : [];

        const dossierToDelete = dossiers.find(d => d.id === dossierId);
        if (!dossierToDelete) {
            return res.status(404).json({ message: "Dossier non trouvé." });
        }

        if (dossierToDelete.image) {
            const imagePath = path.join(__dirname, dossierToDelete.image);
            try { await fs.unlink(imagePath); } catch (unlinkError) {
                console.warn(`Impossible de supprimer l'image ${imagePath}:`, unlinkError);
            }
        }

        dossiers = dossiers.filter(d => d.id !== dossierId);
        await writeJsonFile(DOSSIERS_FILE, { dossiers });

        // Notify all connected clients about the deleted post
        io.emit('delete_dossier', { id: dossierId });

        // Notifications pour Assane Diop s'il supprime
        if (actionPerformer === "Assane Diop" && dossierToDelete.author !== "Assane Diop") {
            const notificationText = `L'Agence a supprimé votre dossier : "${dossierToDelete.title}"`;
            await createNotification(dossierToDelete.author, notificationText, "admin_action", "Assane Diop");
        }

        res.status(200).json({ message: 'Dossier supprimé avec succès' });
    } catch (error) {
        console.error("Erreur API DELETE /api/dossiers/:id:", error);
        res.status(500).json({ message: "Erreur lors de la suppression du dossier." });
    }
});

// Toggle Dossier Like/Dislike
app.post('/api/dossiers/:id/like', async (req, res) => {
    try {
        const dossierId = parseInt(req.params.id);
        const { agentName, isLike } = req.body;

        if (!agentName) {
            return res.status(400).json({ message: "Nom de l'agent requis." });
        }

        let data = await readJsonFile(DOSSIERS_FILE);
        let dossiers = (data && Array.isArray(data.dossiers)) ? data.dossiers : [];
        const dossier = dossiers.find(d => d.id === dossierId);

        if (!dossier) {
            return res.status(404).json({ message: 'Dossier non trouvé.' });
        }

        const likesSet = new Set(dossier.likes || []);
        const dislikesSet = new Set(dossier.dislikes || []);
        let changed = false;

        if (isLike) {
            if (likesSet.has(agentName)) {
                likesSet.delete(agentName);
            } else {
                likesSet.add(agentName);
                if (dislikesSet.has(agentName)) {
                    dislikesSet.delete(agentName);
                    changed = true;
                }
                // Notification for liking a dossier
                if (dossier.author !== agentName) {
                    await createNotification(dossier.author, `${agentName} a aimé votre dossier "${dossier.title}"`, "like_dossier", agentName);
                }
            }
        } else { // Dislike
            if (dislikesSet.has(agentName)) {
                dislikesSet.delete(agentName);
            } else {
                dislikesSet.add(agentName);
                if (likesSet.has(agentName)) {
                    likesSet.delete(agentName);
                    changed = true;
                }
                // Notification for disliking a dossier
                if (dossier.author !== agentName) {
                    await createNotification(dossier.author, `${agentName} n'a pas aimé votre dossier "${dossier.title}"`, "dislike_dossier", agentName);
                }
            }
        }

        dossier.likes = Array.from(likesSet);
        dossier.dislikes = Array.from(dislikesSet);

        await writeJsonFile(DOSSIERS_FILE, { dossiers });

        // Emit real-time update
        io.emit('update_dossier_likes', { 
            dossierId: dossier.id,
            likes: dossier.likes,
            dislikes: dossier.dislikes
        });

        res.status(200).json({ likes: dossier.likes.length, dislikes: dossier.dislikes.length });

    } catch (error) {
        console.error("Erreur API POST /api/dossiers/:id/like:", error);
        res.status(500).json({ message: "Erreur lors de la mise à jour des likes/dislikes du dossier." });
    }
});

// Toggle Dossier Repost
app.post('/api/dossiers/:id/repost', async (req, res) => {
    try {
        const dossierId = parseInt(req.params.id);
        const { agentName } = req.body;

        if (!agentName) {
            return res.status(400).json({ message: "Nom de l'agent requis." });
        }

        let data = await readJsonFile(DOSSIERS_FILE);
        let dossiers = (data && Array.isArray(data.dossiers)) ? data.dossiers : [];
        const dossier = dossiers.find(d => d.id === dossierId);

        if (!dossier) {
            return res.status(404).json({ message: 'Dossier non trouvé.' });
        }

        const repostsSet = new Set(dossier.reposts || []);

        if (repostsSet.has(agentName)) {
            repostsSet.delete(agentName); // Unrepost
        } else {
            repostsSet.add(agentName); // Repost
            // Send notification to original author
            if (dossier.author !== agentName) {
                const notificationText = `${agentName} a repartagé votre dossier "${dossier.title}"`;
                await createNotification(dossier.author, notificationText, "repost_dossier", agentName);
            }
        }

        dossier.reposts = Array.from(repostsSet);

        await writeJsonFile(DOSSIERS_FILE, { dossiers });

        // Emit real-time update
        io.emit('update_dossier_reposts', {
            dossierId: dossier.id,
            reposts: dossier.reposts
        });

        res.status(200).json({ reposts: dossier.reposts.length });

    } catch (error) {
        console.error("Erreur API POST /api/dossiers/:id/repost:", error);
        res.status(500).json({ message: "Erreur lors de la mise à jour des partages du dossier." });
    }
});


// Comments
app.post('/api/dossiers/:id/comments', async (req, res) => {
    try {
        const dossierId = parseInt(req.params.id);
        const { text, author, parentId } = req.body;

        if (!text || !author) {
            return res.status(400).json({ message: "Texte et auteur du commentaire sont requis." });
        }

        let data = await readJsonFile(DOSSIERS_FILE);
        let dossiers = (data && Array.isArray(data.dossiers)) ? data.dossiers : [];

        const dossier = dossiers.find(d => d.id === dossierId);
        if (!dossier) {
            return res.status(404).json({ message: 'Dossier non trouvé' });
        }

        const newComment = {
            id: Date.now(),
            text,
            author,
            timestamp: new Date().toISOString(),
            parentId: parentId || null,
            likes: [],
            modified: false
        };
        dossier.comments.push(newComment);
        await writeJsonFile(DOSSIERS_FILE, { dossiers });

        // Emit real-time update
        io.emit('new_comment', { dossierId: dossier.id, comment: newComment });

        // Send notification to dossier author
        if (dossier.author !== author) {
            const notificationText = `${author} a commenté votre dossier "${dossier.title}"`;
            await createNotification(dossier.author, notificationText, "new_comment_dossier", author);
        }

        // If it's a reply, send notification to parent comment author
        if (parentId) {
            const parentComment = dossier.comments.find(c => c.id === parentId);
            if (parentComment && parentComment.author !== author) {
                const replyNotificationText = `${author} a répondu à votre commentaire dans "${dossier.title}"`;
                await createNotification(parentComment.author, replyNotificationText, "reply_comment", author);
            }
        }

        res.status(201).json(newComment);
    } catch (error) {
        console.error("Erreur API POST /api/dossiers/:id/comments:", error);
        res.status(500).json({ message: "Erreur lors de l'ajout du commentaire." });
    }
});

app.put('/api/dossiers/:dossierId/comments/:commentId', async (req, res) => {
    try {
        const dossierId = parseInt(req.params.dossierId);
        const commentId = parseInt(req.params.commentId);
        const { text, actionPerformer, noModifiedTag } = req.body;

        if (!text) {
            return res.status(400).json({ message: "Le texte du commentaire est requis." });
        }

        let data = await readJsonFile(DOSSIERS_FILE);
        let dossiers = (data && Array.isArray(data.dossiers)) ? data.dossiers : [];
        const dossier = dossiers.find(d => d.id === dossierId);

        if (!dossier) { return res.status(404).json({ message: 'Dossier non trouvé.' }); }
        
        const comment = dossier.comments.find(c => c.id === commentId);
        if (!comment) { return res.status(404).json({ message: 'Commentaire non trouvé.' }); }

        comment.text = text;
        comment.modified = !(noModifiedTag === 'true');
        comment.timestamp = new Date().toISOString();

        await writeJsonFile(DOSSIERS_FILE, { dossiers });

        // Emit real-time update
        io.emit('update_comment', { dossierId: dossier.id, comment: comment });

        // Notification for comment modification if not by author
        if (comment.author !== actionPerformer) {
            const notificationText = `${actionPerformer} a modifié un commentaire dans votre dossier "${dossier.title}"`;
            await createNotification(comment.author, notificationText, "edit_comment", actionPerformer);
        }

        res.status(200).json(comment);

    } catch (error) {
        console.error("Erreur API PUT /api/dossiers/:dossierId/comments/:commentId:", error);
        res.status(500).json({ message: "Erreur lors de la modification du commentaire." });
    }
});

app.delete('/api/dossiers/:dossierId/comments/:commentId', async (req, res) => {
    try {
        const dossierId = parseInt(req.params.dossierId);
        const commentId = parseInt(req.params.commentId);
        const { actionPerformer } = req.body;

        let data = await readJsonFile(DOSSIERS_FILE);
        let dossiers = (data && Array.isArray(data.dossiers)) ? data.dossiers : [];
        const dossier = dossiers.find(d => d.id === dossierId);

        if (!dossier) { return res.status(404).json({ message: 'Dossier non trouvé.' }); }
        
        const commentIndex = dossier.comments.findIndex(c => c.id === commentId);
        if (commentIndex === -1) { return res.status(404).json({ message: 'Commentaire non trouvé.' }); }
        
        const deletedComment = dossier.comments.splice(commentIndex, 1)[0];
        
        // Remove any replies to this comment as well (recursive deletion for replies)
        const commentsToDelete = [commentId];
        let i = 0;
        while(i < commentsToDelete.length) {
            const currentId = commentsToDelete[i];
            const directReplies = dossier.comments.filter(c => c.parentId === currentId);
            directReplies.forEach(reply => commentsToDelete.push(reply.id));
            i++;
        }
        dossier.comments = dossier.comments.filter(c => !commentsToDelete.includes(c.id));


        await writeJsonFile(DOSSIERS_FILE, { dossiers });

        // Emit real-time update
        io.emit('delete_comment', { dossierId: dossier.id, commentId: commentId });

        // Notification for comment deletion if not by author
        if (deletedComment.author !== actionPerformer) {
            const notificationText = `${actionPerformer} a supprimé un commentaire dans votre dossier "${dossier.title}"`;
            await createNotification(deletedComment.author, notificationText, "delete_comment", actionPerformer);
        }

        res.status(200).json({ message: 'Commentaire supprimé.' });

    } catch (error) {
        console.error("Erreur API DELETE /api/dossiers/:dossierId/comments/:commentId:", error);
        res.status(500).json({ message: "Erreur lors de la suppression du commentaire." });
    }
});


// Toggle Comment Like
app.post('/api/dossiers/:dossierId/comments/:commentId/like', async (req, res) => {
    try {
        const dossierId = parseInt(req.params.dossierId);
        const commentId = parseInt(req.params.commentId);
        const { agentName } = req.body;

        if (!agentName) {
            return res.status(400).json({ message: "Nom de l'agent requis." });
        }

        let data = await readJsonFile(DOSSIERS_FILE);
        let dossiers = (data && Array.isArray(data.dossiers)) ? data.dossiers : [];
        const dossier = dossiers.find(d => d.id === dossierId);

        if (!dossier) { return res.status(404).json({ message: 'Dossier non trouvé.' }); }
        
        const comment = dossier.comments.find(c => c.id === commentId);
        if (!comment) { return res.status(404).json({ message: 'Commentaire non trouvé.' }); }

        const likesSet = new Set(comment.likes || []);

        if (likesSet.has(agentName)) {
            likesSet.delete(agentName);
        } else {
            likesSet.add(agentName);
            if (comment.author !== agentName) {
                 const notificationText = `${agentName} a aimé votre commentaire dans "${dossier.title}"`;
                 await createNotification(comment.author, notificationText, "like_comment", agentName);
            }
        }
        comment.likes = Array.from(likesSet);

        await writeJsonFile(DOSSIERS_FILE, { dossiers });

        // Emit real-time update
        io.emit('update_comment_likes', {
            dossierId: dossier.id,
            commentId: comment.id,
            likes: comment.likes
        });

        res.status(200).json({ likes: comment.likes.length });

    } catch (error) {
        console.error("Erreur API POST /api/dossiers/:dossierId/comments/:commentId/like:", error);
        res.status(500).json({ message: "Erreur lors de la mise à jour des likes du commentaire." });
    }
});

// Notifications API
// GET /api/notifications/:agentName : Récupère les notifications pour un agent
app.get('/api/notifications/:agentName', async (req, res) => {
    try {
        const agentName = req.params.agentName;
        let data = await readJsonFile(NOTIFICATIONS_FILE, { notifications: [] });
        let allNotifications = (data.notifications || []);
        
        // Filter notifications for this agent (recipient is agentName OR "all")
        const agentNotifications = allNotifications.filter(n => n.recipient === agentName || n.recipient === "all");

        // We return only UNREAD notifications, and mark them as read when fetched.
        // For 'all' notifications, they are duplicated for each agent, so marking 'all' as read
        // means creating a 'read' entry for that agent. This is more complex than simple deletion.
        // For now, let's keep it simple: we fetch all and frontend decides what is new.
        // For marking as read, we will use a dedicated PUT endpoint, not GET.
        
        res.status(200).json(agentNotifications);
    } catch (error) {
        console.error("Erreur API GET /api/notifications/:agentName:", error);
        res.status(500).json({ message: "Erreur lors de la récupération des notifications." });
    }
});

// PUT /api/notifications/mark-read/:id : Marquer une notification comme lue (New)
app.put('/api/notifications/mark-read/:id', async (req, res) => {
    try {
        const notificationId = parseInt(req.params.id);
        const { agentName } = req.body;
        let data = await readJsonFile(NOTIFICATIONS_FILE);
        let notifications = (data.notifications || []);

        const notification = notifications.find(n => n.id === notificationId);
        if (!notification) {
            return res.status(404).json({ message: "Notification non trouvée." });
        }

        // For "all" recipient notifications, we need to add a "readBy" array
        // to avoid deleting it for everyone.
        if (notification.recipient === "all") {
            if (!notification.readBy) notification.readBy = [];
            if (!notification.readBy.includes(agentName)) {
                notification.readBy.push(agentName);
            }
        } else {
            // For direct notifications, we can just remove it
            notifications = notifications.filter(n => n.id !== notificationId);
        }
        
        await writeJsonFile(NOTIFICATIONS_FILE, { notifications });
        res.status(200).json({ message: "Notification marquée comme lue." });

    } catch (error) {
        console.error("Erreur API PUT /api/notifications/mark-read/:id:", error);
        res.status(500).json({ message: "Erreur lors du marquage comme lu de la notification." });
    }
});

// DELETE /api/notifications/:id : Supprime une notification spécifique (permanente)
app.delete('/api/notifications/:id', async (req, res) => {
    try {
        const notificationId = parseInt(req.params.id);
        let data = await readJsonFile(NOTIFICATIONS_FILE);
        let notifications = (data.notifications || []);
        
        notifications = notifications.filter(n => n.id !== notificationId);
        await writeJsonFile(NOTIFICATIONS_FILE, { notifications });
        
        io.emit('delete_notification_client', { notificationId: notificationId }); // Push deletion to clients
        res.status(200).json({ message: "Notification supprimée." });
    } catch (error) {
        console.error("Erreur API DELETE /api/notifications/:id:", error);
        res.status(500).json({ message: "Erreur lors de la suppression de la notification." });
    }
});

// DELETE /api/notifications/all/:agentName : Supprime toutes les notifications pour un agent
app.delete('/api/notifications/all/:agentName', async (req, res) => {
    try {
        const agentName = req.params.agentName;
        let data = await readJsonFile(NOTIFICATIONS_FILE);
        let notifications = (data.notifications || []);
        
        // Mark "all" notifications as read by this agent
        notifications.forEach(n => {
            if (n.recipient === "all") {
                if (!n.readBy) n.readBy = [];
                if (!n.readBy.includes(agentName)) {
                    n.readBy.push(agentName);
                }
            }
        });
        // Remove direct notifications for this agent
        notifications = notifications.filter(n => n.recipient !== agentName);

        await writeJsonFile(NOTIFICATIONS_FILE, { notifications });

        io.emit('delete_all_notifications_client', { agentName: agentName }); // Push deletion to clients
        res.status(200).json({ message: "Toutes les notifications supprimées." });
    } catch (error) {
        console.error("Erreur API DELETE /api/notifications/all/:agentName:", error);
        res.status(500).json({ message: "Erreur lors de la suppression de toutes les notifications." });
    }
});

// Helper to create a notification (internal server function)
async function createNotification(recipient, message, type = "general", originAuthor = null) {
    let data = await readJsonFile(NOTIFICATIONS_FILE, { notifications: [] });
    let notifications = (data.notifications || []);
    
    const newNotification = {
        id: Date.now(),
        recipient, // Could be specific agent name or "all"
        message,
        timestamp: new Date().toISOString(),
        type, // e.g., "general", "admin_action", "like", "comment"
        originAuthor, // Useful for linking back to original content creator
        readBy: [] // New: Agents who have read this notification (for "all" recipient)
    };
    notifications.push(newNotification);
    await writeJsonFile(NOTIFICATIONS_FILE, { notifications });
    
    // Emit the notification in real-time
    io.emit('new_notification', newNotification);
}


// --- Routes pour la Messagerie Privée (NOUVEAU) ---

// POST /api/contacts/request: Envoyer une demande de contact
app.post('/api/contacts/request', async (req, res) => {
    try {
        const { sender, recipient } = req.body;
        if (!sender || !recipient) {
            return res.status(400).json({ message: "Expéditeur et destinataire requis." });
        }
        let messagesData = await readJsonFile(MESSAGES_FILE);
        let contacts = messagesData.contacts;

        // Empêcher les demandes en double ou vers soi-même
        if (sender.toLowerCase() === recipient.toLowerCase() || 
            contacts.some(c => (c.agent1.toLowerCase() === sender.toLowerCase() && c.agent2.toLowerCase() === recipient.toLowerCase()) || 
                               (c.agent1.toLowerCase() === recipient.toLowerCase() && c.agent2.toLowerCase() === sender.toLowerCase()))) {
            return res.status(400).json({ message: "Demande de contact invalide ou déjà existante." });
        }

        contacts.push({ id: Date.now(), agent1: sender, agent2: recipient, status: 'pending', initiator: sender, timestamp: Date.now() });
        await writeJsonFile(MESSAGES_FILE, messagesData);

        await createNotification(recipient, `${sender} vous a envoyé une demande de contact.`, "contact_request", sender);
        io.emit('contact_request_sent', { sender, recipient }); // Notify recipient
        res.status(200).json({ message: "Demande de contact envoyée." });
    } catch (error) {
        console.error("Erreur API POST /api/contacts/request:", error);
        res.status(500).json({ message: "Erreur lors de l'envoi de la demande de contact." });
    }
});

// POST /api/contacts/accept: Accepter une demande de contact
app.post('/api/contacts/accept', async (req, res) => {
    try {
        const { contactId, acceptorAgentName } = req.body; // Using contactId to identify
        if (!contactId || !acceptorAgentName) {
            return res.status(400).json({ message: "ID du contact et nom de l'agent requis." });
        }
        let messagesData = await readJsonFile(MESSAGES_FILE);
        let contacts = messagesData.contacts;

        const contactRequest = contacts.find(c => c.id === contactId && c.agent2 === acceptorAgentName && c.status === 'pending');

        if (!contactRequest) {
            return res.status(404).json({ message: "Demande de contact non trouvée ou non valide." });
        }

        contactRequest.status = 'accepted';
        contactRequest.acceptedAt = Date.now();
        await writeJsonFile(MESSAGES_FILE, messagesData);

        // Create an empty conversation if it doesn't exist
        let conversations = messagesData.conversations;
        const existingConversation = conversations.find(conv => 
            (conv.participants.includes(contactRequest.agent1) && conv.participants.includes(contactRequest.agent2)) && conv.participants.length === 2
        );
        if (!existingConversation) {
            conversations.push({
                id: Date.now(),
                participants: [contactRequest.agent1, contactRequest.agent2],
                messages: []
            });
            await writeJsonFile(MESSAGES_FILE, messagesData);
        }

        await createNotification(contactRequest.agent1, `${acceptorAgentName} a accepté votre demande de contact.`, "contact_accepted", acceptorAgentName);
        io.emit('contact_accepted_event', { contactId: contactId, agent1: contactRequest.agent1, agent2: contactRequest.agent2 });
        res.status(200).json({ message: "Demande de contact acceptée." });
    } catch (error) {
        console.error("Erreur API POST /api/contacts/accept:", error);
        res.status(500).json({ message: "Erreur lors de l'acceptation de la demande de contact." });
    }
});

// GET /api/contacts/:agentName: Récupérer les contacts et demandes
app.get('/api/contacts/:agentName', async (req, res) => {
    try {
        const agentName = req.params.agentName;
        let messagesData = await readJsonFile(MESSAGES_FILE);
        let contacts = messagesData.contacts;

        const agentContacts = contacts.filter(c => c.agent1 === agentName || c.agent2 === agentName);
        res.status(200).json(agentContacts);
    } catch (error) {
        console.error("Erreur API GET /api/contacts/:agentName:", error);
        res.status(500).json({ message: "Erreur lors de la récupération des contacts." });
    }
});


// GET /api/messages/:agent1/:agent2: Récupérer une conversation
app.get('/api/messages/:agent1/:agent2', async (req, res) => {
    try {
        const { agent1, agent2 } = req.params;
        let messagesData = await readJsonFile(MESSAGES_FILE);
        let conversations = messagesData.conversations;

        const conversation = conversations.find(conv => 
            (conv.participants.includes(agent1) && conv.participants.includes(agent2)) && conv.participants.length === 2
        );

        if (!conversation) {
            return res.status(200).json({ messages: [] });
        }
        res.status(200).json(conversation.messages);
    } catch (error) {
        console.error("Erreur API GET /api/messages/:agent1/:agent2:", error);
        res.status(500).json({ message: "Erreur lors de la récupération des messages." });
    }
});

// POST /api/messages: Envoyer un message
app.post('/api/messages', async (req, res) => {
    try {
        const { sender, recipient, text, transferFromMessageId } = req.body;
        if (!sender || !recipient || !text) {
            return res.status(400).json({ message: "Expéditeur, destinataire et texte requis." });
        }
        let messagesData = await readJsonFile(MESSAGES_FILE);
        let conversations = messagesData.conversations;

        const conversation = conversations.find(conv => 
            (conv.participants.includes(sender) && conv.participants.includes(recipient)) && conv.participants.length === 2 &&
            messagesData.contacts.some(c => (c.agent1 === sender && c.agent2 === recipient || c.agent1 === recipient && c.agent2 === sender) && c.status === 'accepted')
        );

        if (!conversation) {
            return res.status(403).json({ message: "Conversation introuvable ou contact non accepté." });
        }

        const newMessage = {
            id: Date.now(),
            sender,
            text,
            timestamp: new Date().toISOString(),
            reactions: [],
            transferFromMessageId: transferFromMessageId || null
        };
        conversation.messages.push(newMessage);
        await writeJsonFile(MESSAGES_FILE, messagesData);

        // Emit new message to relevant clients
        io.to(sender).emit('new_private_message', { recipient: recipient, message: newMessage });
        io.to(recipient).emit('new_private_message', { sender: sender, message: newMessage });

        await createNotification(recipient, `${sender} vous a envoyé un message.`, "new_message", sender);
        
        res.status(201).json(newMessage);
    } catch (error) {
        console.error("Erreur API POST /api/messages:", error);
        res.status(500).json({ message: "Erreur lors de l'envoi du message." });
    }
});

// POST /api/messages/:messageId/react: Réagir à un message
app.post('/api/messages/:messageId/react', async (req, res) => {
    try {
        const messageId = parseInt(req.params.messageId);
        const { agentName, emoji } = req.body;
        if (!agentName || !emoji) {
            return res.status(400).json({ message: "Nom de l'agent et emoji requis." });
        }
        let messagesData = await readJsonFile(MESSAGES_FILE);
        let conversations = messagesData.conversations;

        let foundMessage = null;
        let recipientAgent = null; // The agent who sent the message (will receive notification)
        let conversationParticipants = [];

        for (const conv of conversations) {
            foundMessage = conv.messages.find(msg => msg.id === messageId);
            if (foundMessage) {
                recipientAgent = foundMessage.sender; 
                conversationParticipants = conv.participants;
                
                const existingReactionIndex = foundMessage.reactions.findIndex(r => r.agent === agentName);
                if (existingReactionIndex > -1) {
                    if (foundMessage.reactions[existingReactionIndex].emoji === emoji) {
                        foundMessage.reactions.splice(existingReactionIndex, 1); // Remove if same emoji
                    } else {
                        foundMessage.reactions[existingReactionIndex].emoji = emoji; // Change if different
                    }
                } else {
                    foundMessage.reactions.push({ emoji, agent: agentName });
                }
                break;
            }
        }

        if (!foundMessage) {
            return res.status(404).json({ message: "Message non trouvé." });
        }

        await writeJsonFile(MESSAGES_FILE, messagesData);

        // Emit real-time reaction update to all participants in the conversation
        if (conversationParticipants.length > 0) {
            conversationParticipants.forEach(participant => {
                io.to(participant).emit('message_reaction_update', {
                    messageId: foundMessage.id,
                    reactions: foundMessage.reactions,
                    reactor: agentName,
                    emoji: emoji
                });
            });
        }

        // Send notification to message sender if not reacting to own message
        if (recipientAgent && recipientAgent !== agentName) {
            await createNotification(recipientAgent, `${agentName} a réagi à votre message avec ${emoji}.`, "message_reaction", agentName);
        }

        res.status(200).json(foundMessage.reactions);
    } catch (error) {
        console.error("Erreur API POST /api/messages/:messageId/react:", error);
        res.status(500).json({ message: "Erreur lors de la réaction au message." });
    }
});


// --- Socket.IO connection handling ---
io.on('connection', (socket) => {
    console.log(`Agent connecté: ${socket.id}`);

    // When a client connects, they need to identify themselves to join their "room"
    socket.on('agent_identify', (agentName) => {
        socket.join(agentName); // Join a room specific to this agent's name
        console.log(`Agent ${agentName} a rejoint la salle ${agentName}`);
    });

    socket.on('disconnect', () => {
        console.log(`Agent déconnecté: ${socket.id}`);
    });
});


// --- Lancement du serveur ---
initializeDataFiles().then(() => {
    server.listen(PORT, () => { // Use server.listen, not app.listen
        console.log(`Serveur du coffre-fort d'Arsène Lupin démarré sur http://localhost:${PORT}`);
        console.log(`Accédez à l'application via : http://localhost:${PORT}`);
    });
}).catch(err => {
    console.error("Échec du démarrage du serveur en raison d'une erreur d'initialisation:", err);
    process.exit(1);
});