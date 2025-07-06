const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const cors = require('cors');
const multer = require('multer');
const http = require('http'); // Requis pour Socket.IO
const { Server } = require('socket.io'); // Serveur Socket.IO

const app = express();
const server = http.createServer(app); // Crée le serveur HTTP pour Express et Socket.IO
const io = new Server(server, {
    cors: {
        origin: "*", // Autorise toutes les origines pour le développement
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
app.use(express.json()); // Pour parser le corps des requêtes en JSON
app.use(express.urlencoded({ extended: true })); // Pour parser les données de formulaires URL-encodées

// --- Configuration Multer pour l'upload de fichiers ---
const UPLOADS_DIR = path.join(__dirname, 'uploads'); // Chemin absolu vers le dossier 'uploads'
const storage = multer.diskStorage({
    destination: async (req, file, cb) => {
        try {
            await fs.mkdir(UPLOADS_DIR, { recursive: true }); // Crée le dossier 'uploads' si inexistant
            cb(null, UPLOADS_DIR); // Le chemin où les fichiers seront enregistrés
        } catch (err) {
            console.error(`Erreur lors de la création du dossier d'uploads (${UPLOADS_DIR}):`, err);
            cb(err); // Passe l'erreur à Express
        }
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        // Stocke l'extension originale pour le type de média
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});
// Multer setup: utilise .any() pour capturer tous les fichiers, puis filtre/valide dans le gestionnaire de route
// Cela aide à éviter "Unexpected field" si le nom du champ diffère
const upload = multer({ storage: storage }); 

// --- Chemins des fichiers de données JSON ---
const DATA_DIR = path.join(__dirname, 'data'); // Chemin absolu vers le dossier 'data'
const AGENTS_FILE = path.join(DATA_DIR, 'agents.json'); // Chemin du fichier agents.json
const DOSSIERS_FILE = path.join(DATA_DIR, 'dossiers.json'); // Chemin du fichier dossiers.json
const NOTIFICATIONS_FILE = path.join(DATA_DIR, 'notifications.json'); // Chemin du fichier notifications.json
const MESSAGES_FILE = path.join(DATA_DIR, 'messages.json'); // Chemin du fichier messages.json

// --- Fonctions utilitaires pour la lecture/écriture de JSON ---
async function readJsonFile(filePath, defaultContent = null) {
    try {
        const data = await fs.readFile(filePath, 'utf8');
        if (data.trim() === '') {
            return defaultContent;
        }
        return JSON.parse(data);
    } catch (error) {
        if (error.code === 'ENOENT') { // 'ENOENT' signifie 'Entry NOt ExisTs' (fichier non trouvé)
            return defaultContent;
        }
        if (error instanceof SyntaxError) {
            console.error(`Erreur de syntaxe JSON dans le fichier ${filePath}:`, error);
            // Au lieu de jeter une erreur, on tente de récupérer en retournant le contenu par défaut,
            // mais on loggue tout de même un avertissement critique. Cela rend le serveur plus résilient.
            console.warn(`Tentative de récupération du fichier corrompu: ${filePath}. Le contenu sera écrasé avec le défaut.`);
            return defaultContent; // Retourne le contenu par défaut pour permettre à l'initialisation de le réparer
        }
        console.error(`Erreur lors de la lecture du fichier JSON ${filePath}:`, error);
        throw error; // Propage l'erreur si c'est une autre erreur inattendue
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
        await fs.mkdir(DATA_DIR, { recursive: true }); // Crée le dossier 'data' si inexistant

        // Initialisation de agents.json
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

        // Initialisation de dossiers.json
        let dossiers = await readJsonFile(DOSSIERS_FILE, { dossiers: [] });
        if (!dossiers || !Array.isArray(dossiers.dossiers)) {
            console.log("Initialisation: dossiers.json est vide ou corrompu. Création d'un tableau de dossiers vide.");
            dossiers = { dossiers: [] };
            await writeJsonFile(DOSSIERS_FILE, dossiers);
        } else {
            console.log("Initialisation: dossiers.json trouvé.");
        }

        // Initialisation de notifications.json
        let notifications = await readJsonFile(NOTIFICATIONS_FILE, { notifications: [] });
        if (!notifications || !Array.isArray(notifications.notifications)) {
            console.log("Initialisation: notifications.json est vide ou corrompu. Création d'un tableau de notifications vide.");
            notifications = { notifications: [] };
            await writeJsonFile(NOTIFICATIONS_FILE, notifications);
        } else {
            console.log("Initialisation: notifications.json trouvé.");
        }

        // Initialisation de messages.json
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
        process.exit(1); // Quitte le processus si l'initialisation des fichiers échoue pour éviter d'autres erreurs
    }
}

// --- Serve static files (frontend) ---
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOADS_DIR)); // Rend le dossier 'uploads' accessible publiquement

// --- API Routes ---

// Agents
app.get('/api/agents', async (req, res) => {
    try {
        const data = await readJsonFile(AGENTS_FILE, { agents: [] }); // Fournit une valeur par défaut même ici
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
        const data = await readJsonFile(DOSSIERS_FILE, { dossiers: [] }); // Fournit une valeur par défaut même ici
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

// POST /api/dossiers : Crée un nouveau dossier (avec upload de multiples médias)
app.post('/api/dossiers', upload.array('media'), async (req, res) => { // Utilise upload.array pour multiples fichiers
    try {
        const { title, desc, author } = req.body;
        const isHidden = req.body.isHidden === 'true' || false; 
        const imageHidden = req.body.imageHidden === 'true' || false; // Encore utilisé par le frontend
        
        // Mappe les fichiers uploadés vers un tableau de médias
        const media = req.files ? req.files.map(file => ({
            url: `/uploads/${file.filename}`,
            type: file.mimetype.startsWith('image/') ? 'image' : 'video'
        })) : [];

        if (!title || !desc || !author) {
            // Supprime les fichiers uploadés si la validation échoue
            if (req.files) {
                for (const file of req.files) {
                    await fs.unlink(file.path);
                }
            }
            return res.status(400).json({ message: "Titre, description et auteur sont requis." });
        }

        let data = await readJsonFile(DOSSIERS_FILE, { dossiers: [] });
        let dossiers = (data && Array.isArray(data.dossiers)) ? data.dossiers : [];

        const newDossier = {
            id: Date.now(),
            title,
            desc,
            media: media, // Utilise le tableau de médias
            author,
            comments: [],
            likes: [],
            dislikes: [],
            reposts: [],
            isHidden: isHidden,
            imageHidden: imageHidden // Garde pour la compatibilité avec le frontend
        };

        dossiers.unshift(newDossier);
        await writeJsonFile(DOSSIERS_FILE, { dossiers });
        
        // Notifie les contacts acceptés de l'auteur du nouveau post (système d'abonnement)
        const messagesData = await readJsonFile(MESSAGES_FILE, { contacts: [], conversations: [] });
        const contacts = messagesData.contacts.filter(c => 
            c.status === 'accepted' && (c.agent1 === author || c.agent2 === author)
        );
        const recipients = contacts.map(c => c.agent1 === author ? c.agent2 : c.agent1);
        
        // Envoie une notification à chaque contact accepté
        for (const recipient of recipients) {
            await createNotification(recipient, `${author} a posté un nouveau dossier : "${title}"`, "new_post_friend", author);
        }

        io.emit('new_dossier', newDossier); // Émet globalement pour la mise à jour en temps réel
        res.status(201).json(newDossier);
    } catch (error) {
        console.error("Erreur API POST /api/dossiers:", error);
        res.status(500).json({ message: "Erreur lors de la création du dossier." });
    }
});

// PUT /api/dossiers/:id : Met à jour un dossier existant (avec possibilité de changer les médias)
app.put('/api/dossiers/:id', upload.array('media'), async (req, res) => { // Utilise upload.array pour multiples fichiers
    try {
        const dossierId = parseInt(req.params.id);
        const { title, desc, author, isHidden, imageHidden, actionPerformer } = req.body;
        
        // Nouveaux fichiers médias uploadés (req.files)
        const newMediaFiles = req.files ? req.files.map(file => ({
            url: `/uploads/${file.filename}`,
            type: file.mimetype.startsWith('image/') ? 'image' : 'video'
        })) : [];
        
        // URLs des médias existants envoyés depuis le frontend (fichiers non supprimés par l'utilisateur)
        let existingMediaUrls = req.body.existingMediaUrls ? JSON.parse(req.body.existingMediaUrls) : [];
        if (!Array.isArray(existingMediaUrls)) existingMediaUrls = []; // S'assure que c'est un tableau
        existingMediaUrls = existingMediaUrls.map(url => ({ url: url, type: url.match(/\.(mp4|mov|avi)$/i) ? 'video' : 'image' }));


        let data = await readJsonFile(DOSSIERS_FILE, { dossiers: [] });
        let dossiers = (data && Array.isArray(data.dossiers)) ? data.dossiers : [];

        const index = dossiers.findIndex(d => d.id === dossierId);
        if (index === -1) {
            if (req.files) { for (const file of req.files) { await fs.unlink(file.path); } }
            return res.status(404).json({ message: "Dossier non trouvé." });
        }

        const currentDossier = dossiers[index];
        const oldMedia = currentDossier.media || []; // Récupère les anciens médias

        // Combine les médias existants (conservés par le client) et les nouveaux médias uploadés
        const updatedMedia = [...existingMediaUrls, ...newMediaFiles];

        // Supprime les anciens fichiers qui ne sont plus dans `updatedMedia`
        for (const oldM of oldMedia) {
            if (!updatedMedia.some(newM => newM.url === oldM.url)) {
                const filePath = path.join(__dirname, oldM.url);
                try {
                    await fs.unlink(filePath);
                    console.log(`Fichier média ancien supprimé: ${filePath}`);
                } catch (unlinkError) {
                    console.warn(`Impossible de supprimer l'ancien fichier média ${filePath}:`, unlinkError);
                }
            }
        }


        dossiers[index] = {
            ...currentDossier,
            title: title !== undefined ? title : currentDossier.title,
            desc: desc !== undefined ? desc : currentDossier.desc,
            media: updatedMedia, // Met à jour avec le nouveau tableau de médias
            isHidden: isHidden === 'true', 
            imageHidden: imageHidden === 'true', // Garde pour la compatibilité avec le frontend
            author: author !== undefined ? author : currentDossier.author
        };

        await writeJsonFile(DOSSIERS_FILE, { dossiers });

        io.emit('update_dossier', dossiers[index]); // Émet globalement pour la mise à jour en temps réel

        // Notifications pour Assane Diop si c'est lui qui modifie/floute
        if (actionPerformer === "Assane Diop" && currentDossier.author !== "Assane Diop") {
            let notificationText = `L'Agence a modifié votre dossier : "${currentDossier.title}"`;
            if (isHidden !== undefined && isHidden === 'true' && !currentDossier.isHidden) { // Était visible, maintenant masqué
                 notificationText = `L'Agence a masqué votre dossier : "${currentDossier.title}"`;
            } else if (isHidden !== undefined && isHidden === 'false' && currentDossier.isHidden) { // Était masqué, maintenant visible
                notificationText = `L'Agence a ré-affiché votre dossier : "${currentDossier.title}"`;
            } else if (imageHidden !== undefined && imageHidden === 'true' && !currentDossier.imageHidden) { // Média était visible, maintenant masqué
                notificationText = `L'Agence a masqué le média de votre dossier : "${currentDossier.title}"`;
            } else if (imageHidden !== undefined && imageHidden === 'false' && currentDossier.imageHidden) { // Média était masqué, maintenant visible
                notificationText = `L'Agence a ré-affiché le média de votre dossier : "${currentDossier.title}"`;
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
        let data = await readJsonFile(DOSSIERS_FILE, { dossiers: [] });
        let dossiers = (data && Array.isArray(data.dossiers)) ? data.dossiers : [];

        const dossierToDelete = dossiers.find(d => d.id === dossierId);
        if (!dossierToDelete) {
            return res.status(404).json({ message: "Dossier non trouvé." });
        }

        // Supprime tous les fichiers médias associés
        if (dossierToDelete.media && Array.isArray(dossierToDelete.media)) {
            for (const mediaItem of dossierToDelete.media) {
                const filePath = path.join(__dirname, mediaItem.url);
                try {
                    await fs.unlink(filePath);
                    console.log(`Fichier média supprimé: ${filePath}`);
                } catch (unlinkError) {
                    console.warn(`Impossible de supprimer le fichier média ${filePath}:`, unlinkError);
                }
            }
        }

        dossiers = dossiers.filter(d => d.id !== dossierId);
        await writeJsonFile(DOSSIERS_FILE, { dossiers });

        io.emit('delete_dossier', { id: dossierId }); // Émet globalement pour la mise à jour en temps réel

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

        let data = await readJsonFile(DOSSIERS_FILE, { dossiers: [] });
        let dossiers = (data && Array.isArray(data.dossiers)) ? data.dossiers : [];
        const dossier = dossiers.find(d => d.id === dossierId);

        if (!dossier) {
            return res.status(404).json({ message: 'Dossier non trouvé.' });
        }

        const likesSet = new Set(dossier.likes || []);
        const dislikesSet = new Set(dossier.dislikes || []);
        
        if (isLike) {
            if (likesSet.has(agentName)) {
                likesSet.delete(agentName); // Annuler le like
            } else {
                likesSet.add(agentName); // Liker
                if (dislikesSet.has(agentName)) {
                    dislikesSet.delete(agentName); // Si on like, on enlève le dislike
                }
                // Notification pour le like d'un dossier
                if (dossier.author !== agentName) {
                    await createNotification(dossier.author, `${agentName} a aimé votre dossier "${dossier.title}"`, "like_dossier", agentName);
                }
            }
        } else { // Dislike
            if (dislikesSet.has(agentName)) {
                dislikesSet.delete(agentName); // Annuler le dislike
            } else {
                dislikesSet.add(agentName); // Disliker
                if (likesSet.has(agentName)) {
                    likesSet.delete(agentName); // Si on dislike, on enlève le like
                }
                // Notification pour le dislike d'un dossier
                if (dossier.author !== agentName) {
                    await createNotification(dossier.author, `${agentName} n'a pas aimé votre dossier "${dossier.title}"`, "dislike_dossier", agentName);
                }
            }
        }

        dossier.likes = Array.from(likesSet);
        dossier.dislikes = Array.from(dislikesSet);

        await writeJsonFile(DOSSIERS_FILE, { dossiers });

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

        let data = await readJsonFile(DOSSIERS_FILE, { dossiers: [] });
        let dossiers = (data && Array.isArray(data.dossiers)) ? data.dossiers : [];
        const dossier = dossiers.find(d => d.id === dossierId);

        if (!dossier) {
            return res.status(404).json({ message: 'Dossier non trouvé.' });
        }

        const repostsSet = new Set(dossier.reposts || []);

        if (repostsSet.has(agentName)) {
            repostsSet.delete(agentName); // Annuler le repost
        } else {
            repostsSet.add(agentName); // Reposter
            if (dossier.author !== agentName) {
                const notificationText = `${agentName} a repartagé votre dossier "${dossier.title}"`;
                await createNotification(dossier.author, notificationText, "repost_dossier", agentName);
            }
        }

        dossier.reposts = Array.from(repostsSet);

        await writeJsonFile(DOSSIERS_FILE, { dossiers });

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


// Commentaires
app.post('/api/dossiers/:id/comments', async (req, res) => {
    try {
        const dossierId = parseInt(req.params.id);
        const { text, author, parentId } = req.body;

        if (!text || !author) {
            return res.status(400).json({ message: "Texte et auteur du commentaire sont requis." });
        }

        let data = await readJsonFile(DOSSIERS_FILE, { dossiers: [] });
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
            modified: false // Nouveau : pour indiquer si le commentaire a été modifié
        };
        dossier.comments.push(newComment);
        await writeJsonFile(DOSSIERS_FILE, { dossiers });

        io.emit('new_comment', { dossierId: dossier.id, comment: newComment }); // Émet pour la mise à jour en temps réel

        // Envoie une notification à l'auteur du dossier
        if (dossier.author !== author) {
            const notificationText = `${author} a commenté votre dossier "${dossier.title}"`;
            await createNotification(dossier.author, notificationText, "new_comment_dossier", author);
        }

        // Si c'est une réponse, envoie une notification à l'auteur du commentaire parent
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

// PUT /api/dossiers/:dossierId/comments/:commentId : Modifie un commentaire
app.put('/api/dossiers/:dossierId/comments/:commentId', async (req, res) => {
    try {
        const dossierId = parseInt(req.params.dossierId);
        const commentId = parseInt(req.params.commentId);
        const { text, actionPerformer, noModifiedTag } = req.body;

        if (!text) {
            return res.status(400).json({ message: "Le texte du commentaire est requis." });
        }

        let data = await readJsonFile(DOSSIERS_FILE, { dossiers: [] });
        let dossiers = (data && Array.isArray(data.dossiers)) ? data.dossiers : [];
        const dossier = dossiers.find(d => d.id === dossierId);

        if (!dossier) { return res.status(404).json({ message: 'Dossier non trouvé.' }); }
        
        const comment = dossier.comments.find(c => c.id === commentId);
        if (!comment) { return res.status(404).json({ message: 'Commentaire non trouvé.' }); }

        comment.text = text;
        comment.modified = !(noModifiedTag === 'true'); // Définit 'modified' sauf si 'noModifiedTag' est vrai
        comment.timestamp = new Date().toISOString(); // Met à jour le timestamp de modification

        await writeJsonFile(DOSSIERS_FILE, { dossiers });

        io.emit('update_comment', { dossierId: dossier.id, comment: comment }); // Émet pour la mise à jour en temps réel

        // Notification pour la modification d'un commentaire si ce n'est pas l'auteur
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

// DELETE /api/dossiers/:dossierId/comments/:commentId : Supprime un commentaire
app.delete('/api/dossiers/:dossierId/comments/:commentId', async (req, res) => {
    try {
        const dossierId = parseInt(req.params.dossierId);
        const commentId = parseInt(req.params.commentId);
        const { actionPerformer } = req.body; // Qui a effectué la suppression

        let data = await readJsonFile(DOSSIERS_FILE, { dossiers: [] });
        let dossiers = (data && Array.isArray(data.dossiers)) ? data.dossiers : [];
        const dossier = dossiers.find(d => d.id === dossierId);

        if (!dossier) { return res.status(404).json({ message: 'Dossier non trouvé.' }); }
        
        const commentIndex = dossier.comments.findIndex(c => c.id === commentId);
        if (commentIndex === -1) { return res.status(404).json({ message: 'Commentaire non trouvé.' }); }
        
        const deletedComment = dossier.comments.splice(commentIndex, 1)[0]; // Supprime le commentaire
        
        // Supprime aussi toutes les réponses à ce commentaire (suppression récursive)
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

        io.emit('delete_comment', { dossierId: dossier.id, commentId: commentId }); // Émet pour la mise à jour en temps réel

        // Notification pour la suppression d'un commentaire si ce n'est pas l'auteur
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

        let data = await readJsonFile(DOSSIERS_FILE, { dossiers: [] });
        let dossiers = (data && Array.isArray(data.dossiers)) ? data.dossiers : [];
        const dossier = dossiers.find(d => d.id === dossierId);

        if (!dossier) { return res.status(404).json({ message: 'Dossier non trouvé.' }); }
        
        const comment = dossier.comments.find(c => c.id === commentId);
        if (!comment) { return res.status(404).json({ message: 'Commentaire non trouvé.' }); }

        const likesSet = new Set(comment.likes || []);

        if (likesSet.has(agentName)) {
            likesSet.delete(agentName); // Annuler le like
        } else {
            likesSet.add(agentName); // Liker
            if (comment.author !== agentName) {
                 const notificationText = `${agentName} a aimé votre commentaire dans "${dossier.title}"`;
                 await createNotification(comment.author, notificationText, "like_comment", agentName);
            }
        }
        comment.likes = Array.from(likesSet);

        await writeJsonFile(DOSSIERS_FILE, { dossiers });

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
        
        // Filtre les notifications pertinentes pour cet agent
        const agentNotifications = await Promise.all(allNotifications.map(async n => {
            const isForRecipient = n.recipient === agentName;
            const isForGlobal = n.recipient === "all";
            let isForFriends = false;

            // Si c'est une notification de nouveau post par un ami
            if (n.type === "new_post_friend" && n.originAuthor && n.originAuthor !== agentName) {
                const messagesData = await readJsonFile(MESSAGES_FILE, { contacts: [], conversations: [] });
                const isContact = messagesData.contacts.some(c => 
                    c.status === 'accepted' && 
                    ((c.agent1 === agentName && c.agent2 === n.originAuthor) || 
                     (c.agent1 === n.originAuthor && c.agent2 === agentName))
                );
                isForFriends = isContact;
            }
            
            // Si l'agent a déjà lu cette notification globale
            const hasReadGlobal = isForGlobal && n.readBy && n.readBy.includes(agentName);

            // Retourne la notification si elle est pour cet agent, ou globale et non lue, ou d'un ami
            if (isForRecipient || (isForGlobal && !hasReadGlobal) || isForFriends) {
                // Clone la notification et ajoute la propriété 'read' pour le frontend (ne la persiste pas)
                const notifClone = { ...n };
                notifClone.read = hasReadGlobal; // Marque comme lue si déjà dans readBy
                return notifClone;
            }
            return null;
        }));

        res.status(200).json(agentNotifications.filter(n => n !== null)); // Filtre les nulls
    } catch (error) {
        console.error("Erreur API GET /api/notifications/:agentName:", error);
        res.status(500).json({ message: "Erreur lors de la récupération des notifications." });
    }
});

// PUT /api/notifications/mark-read/:id : Marquer une notification comme lue
app.put('/api/notifications/mark-read/:id', async (req, res) => {
    try {
        const notificationId = parseInt(req.params.id);
        const { agentName } = req.body;
        let data = await readJsonFile(NOTIFICATIONS_FILE, { notifications: [] });
        let notifications = (data.notifications || []);

        const notification = notifications.find(n => n.id === notificationId);
        if (!notification) {
            return res.status(404).json({ message: "Notification non trouvée." });
        }

        if (notification.recipient === "all") {
            if (!notification.readBy) notification.readBy = [];
            if (!notification.readBy.includes(agentName)) {
                notification.readBy.push(agentName);
            }
        } else {
            // Pour les notifications directes, on les supprime simplement quand elles sont lues
            notifications = notifications.filter(n => n.id !== notificationId);
        }
        
        await writeJsonFile(NOTIFICATIONS_FILE, { notifications });
        // Pas besoin d'émettre delete pour les notifications "all" marquées comme lues, le client rafraîchira son état
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
        let data = await readJsonFile(NOTIFICATIONS_FILE, { notifications: [] });
        let notifications = (data.notifications || []);
        
        notifications = notifications.filter(n => n.id !== notificationId);
        await writeJsonFile(NOTIFICATIONS_FILE, { notifications });
        
        io.emit('delete_notification_client', { notificationId: notificationId }); // Push la suppression aux clients
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
        let data = await readJsonFile(NOTIFICATIONS_FILE, { notifications: [] });
        let notifications = (data.notifications || []);
        
        // Marque les notifications "all" comme lues par cet agent
        notifications.forEach(n => {
            if (n.recipient === "all") {
                if (!n.readBy) n.readBy = [];
                if (!n.readBy.includes(agentName)) {
                    n.readBy.push(agentName);
                }
            }
        });
        // Supprime les notifications directes pour cet agent
        notifications = notifications.filter(n => n.recipient !== agentName);

        await writeJsonFile(NOTIFICATIONS_FILE, { notifications });

        io.emit('delete_all_notifications_client', { agentName: agentName }); // Push la suppression aux clients
        res.status(200).json({ message: "Toutes les notifications supprimées." });
    } catch (error) {
        console.error("Erreur API DELETE /api/notifications/all/:agentName:", error);
        res.status(500).json({ message: "Erreur lors de la suppression de toutes les notifications." });
    }
});

// Helper pour créer une notification (fonction interne au serveur)
async function createNotification(recipient, message, type = "general", originAuthor = null) {
    let data = await readJsonFile(NOTIFICATIONS_FILE, { notifications: [] });
    let notifications = (data.notifications || []);
    
    const newNotification = {
        id: Date.now(),
        recipient, // Nom d'agent spécifique, "all", ou "friends" (géré par le filtre GET)
        message,
        timestamp: new Date().toISOString(),
        type, // ex: "general", "admin_action", "like", "comment", "contact_request", "new_post_friend"
        originAuthor, // Utile pour lier à l'auteur original du contenu
        readBy: [] // Agents qui ont lu cette notification (pour les notifications "all" ou futures "group")
    };
    notifications.push(newNotification);
    await writeJsonFile(NOTIFICATIONS_FILE, { notifications });
    
    io.emit('new_notification', newNotification); // Émet la notification en temps réel
}


// --- Routes pour la Messagerie Privée ---

// POST /api/contacts/request: Envoyer une demande de contact
app.post('/api/contacts/request', async (req, res) => {
    try {
        const { sender, recipient } = req.body;
        if (!sender || !recipient) {
            return res.status(400).json({ message: "Expéditeur et destinataire requis." });
        }
        let messagesData = await readJsonFile(MESSAGES_FILE, { contacts: [], conversations: [] });
        let contacts = messagesData.contacts;

        if (sender.toLowerCase() === recipient.toLowerCase()) {
            return res.status(400).json({ message: "Vous ne pouvez pas vous ajouter vous-même." });
        }
        // Vérifie si le destinataire existe
        const agentsData = await readJsonFile(AGENTS_FILE, { agents: [] });
        const recipientExists = agentsData.agents.some(a => a.name.toLowerCase() === recipient.toLowerCase());
        if (!recipientExists) {
            return res.status(404).json({ message: "Le destinataire n'est pas un agent valide." });
        }

        // Empêcher les demandes en double ou vers quelqu'un déjà en contact
        const existingContact = contacts.find(c => 
            (c.agent1.toLowerCase() === sender.toLowerCase() && c.agent2.toLowerCase() === recipient.toLowerCase()) || 
            (c.agent1.toLowerCase() === recipient.toLowerCase() && c.agent2.toLowerCase() === sender.toLowerCase())
        );
        if (existingContact) {
            if (existingContact.status === 'pending') {
                return res.status(400).json({ message: "Une demande est déjà en attente ou a déjà été envoyée/reçue." });
            } else if (existingContact.status === 'accepted') {
                return res.status(400).json({ message: "Vous êtes déjà en contact avec cet agent." });
            }
        }

        const newContactRequest = { id: Date.now(), agent1: sender, agent2: recipient, status: 'pending', initiator: sender, timestamp: Date.now() };
        contacts.push(newContactRequest);
        await writeJsonFile(MESSAGES_FILE, messagesData);

        await createNotification(recipient, `${sender} vous a envoyé une demande de contact.`, "contact_request", sender);
        io.to(recipient).emit('contact_request_received', newContactRequest); // Notifie le destinataire
        res.status(200).json({ message: "Demande de contact envoyée." });
    } catch (error) {
        console.error("Erreur API POST /api/contacts/request:", error);
        res.status(500).json({ message: "Erreur lors de l'envoi de la demande de contact." });
    }
});

// POST /api/contacts/accept: Accepter une demande de contact
app.post('/api/contacts/accept', async (req, res) => {
    try {
        const { contactId, acceptorAgentName } = req.body;
        if (!contactId || !acceptorAgentName) {
            return res.status(400).json({ message: "ID du contact et nom de l'agent requis." });
        }
        let messagesData = await readJsonFile(MESSAGES_FILE, { contacts: [], conversations: [] });
        let contacts = messagesData.contacts;

        const contactRequest = contacts.find(c => c.id === contactId && c.agent2 === acceptorAgentName && c.status === 'pending');

        if (!contactRequest) {
            return res.status(404).json({ message: "Demande de contact non trouvée ou non valide." });
        }

        contactRequest.status = 'accepted';
        contactRequest.acceptedAt = Date.now();
        await writeJsonFile(MESSAGES_FILE, messagesData);

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
        io.to(contactRequest.agent1).emit('contact_accepted_event', contactRequest); // Notifie l'initiateur
        io.to(acceptorAgentName).emit('contact_accepted_event', contactRequest); // Notifie celui qui accepte (mise à jour auto)
        res.status(200).json({ message: "Demande de contact acceptée." });
    } catch (error) {
        console.error("Erreur API POST /api/contacts/accept:", error);
        res.status(500).json({ message: "Erreur lors de l'acceptation de la demande de contact." });
    }
});

// POST /api/contacts/decline: Décliner une demande de contact
app.post('/api/contacts/decline', async (req, res) => {
    try {
        const { contactId, declinerAgentName } = req.body;
        if (!contactId || !declinerAgentName) {
            return res.status(400).json({ message: "ID du contact et nom de l'agent requis." });
        }
        let messagesData = await readJsonFile(MESSAGES_FILE, { contacts: [], conversations: [] });
        let contacts = messagesData.contacts;

        const contactRequestIndex = contacts.findIndex(c => 
            c.id === contactId && c.agent2 === declinerAgentName && c.status === 'pending'
        );

        if (contactRequestIndex === -1) {
            return res.status(404).json({ message: "Demande de contact non trouvée ou non valide." });
        }

        const declinedContact = contacts.splice(contactRequestIndex, 1)[0]; // Supprime la demande
        await writeJsonFile(MESSAGES_FILE, messagesData);

        await createNotification(declinedContact.agent1, `${declinerAgentName} a décliné votre demande de contact.`, "contact_declined", declinerAgentName);
        io.to(declinedContact.agent1).emit('contact_declined_event', declinedContact); // Notifie l'initiateur
        io.to(declinerAgentName).emit('contact_declined_event', declinedContact); // Notifie celui qui décline (mise à jour auto)
        
        res.status(200).json({ message: "Demande de contact déclinée." });
    } catch (error) {
        console.error("Erreur API POST /api/contacts/decline:", error);
        res.status(500).json({ message: "Erreur lors du déclin de la demande de contact." });
    }
});


// GET /api/contacts/:agentName: Récupérer les contacts et demandes
app.get('/api/contacts/:agentName', async (req, res) => {
    try {
        const agentName = req.params.agentName;
        let messagesData = await readJsonFile(MESSAGES_FILE, { contacts: [], conversations: [] });
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
        let messagesData = await readJsonFile(MESSAGES_FILE, { contacts: [], conversations: [] });
        let conversations = messagesData.conversations;

        const conversation = conversations.find(conv => 
            (conv.participants.includes(agent1) && conv.participants.includes(agent2)) && conv.participants.length === 2
        );

        if (!conversation) {
            return res.status(200).json([]); // Pas de conversation, retourne tableau vide de messages
        }
        res.status(200).json(conversation.messages);
    } catch (error) {
        console.error("Erreur API GET /api/messages/:agent1/:agent2:", error);
        res.status(500).json({ message: "Erreur lors de la récupération des messages." });
    }
});

// POST /api/messages: Envoyer un message (avec upload de média)
app.post('/api/messages', upload.single('media'), async (req, res) => {
    try {
        const { sender, recipient, text, transferFromMessageId } = req.body;
        const mediaFile = req.file;

        if (!sender || !recipient || (!text && !mediaFile)) {
            if (mediaFile) await fs.unlink(mediaFile.path); // Supprime le fichier si validation échoue
            return res.status(400).json({ message: "Expéditeur, destinataire et texte/média requis." });
        }

        let messagesData = await readJsonFile(MESSAGES_FILE, { contacts: [], conversations: [] });
        let conversations = messagesData.conversations;

        const conversation = conversations.find(conv => 
            (conv.participants.includes(sender) && conv.participants.includes(recipient)) && conv.participants.length === 2 &&
            messagesData.contacts.some(c => (c.agent1 === sender && c.agent2 === recipient || c.agent1 === recipient && c.agent2 === sender) && c.status === 'accepted')
        );

        if (!conversation) {
            if (mediaFile) await fs.unlink(mediaFile.path);
            return res.status(403).json({ message: "Conversation introuvable ou contact non accepté." });
        }
        
        const mediaUrl = mediaFile ? `/uploads/${mediaFile.filename}` : null;
        const mediaType = mediaFile ? (mediaFile.mimetype.startsWith('image/') ? 'image' : 'video') : null;

        const newMessage = {
            id: Date.now(),
            sender,
            text: text || null, // Peut être null si c'est juste un média
            media: mediaUrl ? { url: mediaUrl, type: mediaType } : null, // Stocke les informations du média
            timestamp: new Date().toISOString(),
            reactions: [],
            transferFromMessageId: transferFromMessageId || null
        };
        conversation.messages.push(newMessage);
        await writeJsonFile(MESSAGES_FILE, messagesData);

        // Émet le nouveau message aux clients pertinents
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
        let messagesData = await readJsonFile(MESSAGES_FILE, { contacts: [], conversations: [] });
        let conversations = messagesData.conversations;

        let foundMessage = null;
        let recipientAgent = null;
        let conversationParticipants = [];

        for (const conv of conversations) {
            foundMessage = conv.messages.find(msg => msg.id === messageId);
            if (foundMessage) {
                recipientAgent = foundMessage.sender; 
                conversationParticipants = conv.participants;
                
                const existingReactionIndex = foundMessage.reactions.findIndex(r => r.agent === agentName);
                if (existingReactionIndex > -1) {
                    if (foundMessage.reactions[existingReactionIndex].emoji === emoji) {
                        foundMessage.reactions.splice(existingReactionIndex, 1); // Supprime si le même emoji
                    } else {
                        foundMessage.reactions[existingReactionIndex].emoji = emoji; // Change si emoji différent
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

        // Émet la mise à jour de la réaction en temps réel à tous les participants de la conversation
        conversationParticipants.forEach(participant => {
            io.to(participant).emit('message_reaction_update', {
                messageId: foundMessage.id,
                reactions: foundMessage.reactions,
                reactor: agentName,
                emoji: emoji
            });
        });

        // Envoie une notification à l'expéditeur du message s'il ne réagit pas à son propre message
        if (recipientAgent && recipientAgent !== agentName) {
            await createNotification(recipientAgent, `${agentName} a réagi à votre message avec ${emoji}.`, "message_reaction", agentName);
        }

        res.status(200).json(foundMessage.reactions);
    } catch (error) {
        console.error("Erreur API POST /api/messages/:messageId/react:", error);
        res.status(500).json({ message: "Erreur lors de la réaction au message." });
    }
});


// --- Gestion des connexions Socket.IO ---
io.on('connection', (socket) => {
    console.log(`Agent connecté: ${socket.id}`);

    // Quand un client se connecte, il doit s'identifier pour rejoindre sa "salle"
    let connectedAgentName = null;
    socket.on('agent_identify', async (agentName) => { // <-- AJOUT DU MOT-CLÉ 'async' ICI
        connectedAgentName = agentName;
        socket.join(agentName); // Joint une salle spécifique au nom de cet agent
        console.log(`Agent ${agentName} a rejoint la salle ${agentName}`);

        // Émet le compte de notifications non lues lors de l'identification
        try {
            const notificationsData = await readJsonFile(NOTIFICATIONS_FILE, { notifications: [] });
            const unreadNotifications = notificationsData.notifications.filter(n => {
                const isForRecipient = n.recipient === agentName;
                const isForGlobal = n.recipient === "all";
                const isReadByAgent = n.readBy && n.readBy.includes(agentName);
                
                // Si c'est une notification de nouveau post d'ami, vérifie le contact
                if (n.type === "new_post_friend" && n.originAuthor && n.originAuthor !== agentName) {
                    const messagesData = readJsonFile(MESSAGES_FILE, { contacts: [], conversations: [] }); // Lecture synchrone pour la notif
                    const isContact = messagesData.contacts.some(c => 
                        c.status === 'accepted' && 
                        ((c.agent1 === agentName && c.agent2 === n.originAuthor) || 
                         (c.agent1 === n.originAuthor && c.agent2 === agentName))
                    );
                    return isContact && !isReadByAgent; // Notifie si ami et non lue
                }
                
                return (isForRecipient || isForGlobal) && !isReadByAgent;
            });
            socket.emit('unread_notification_count', unreadNotifications.length);
        } catch (error) {
            console.error("Erreur lors de l'envoi du compte de notifications non lues:", error);
        }
    });

    socket.on('disconnect', () => {
        if (connectedAgentName) {
            console.log(`Agent ${connectedAgentName} déconnecté`);
        } else {
            console.log(`Agent (non identifié) déconnecté: ${socket.id}`);
        }
    });
});


// --- Lancement du serveur ---
initializeDataFiles().then(() => {
    server.listen(PORT, () => { // Utilise server.listen, pas app.listen
        console.log(`Serveur du coffre-fort d'Arsène Lupin démarré sur http://localhost:${PORT}`);
        console.log(`Accédez à l'application via : http://localhost:${PORT}`);
    });
}).catch(err => {
    console.error("Échec du démarrage du serveur en raison d'une erreur d'initialisation:", err);
    process.exit(1); // Quitte le processus si l'initialisation échoue
});
