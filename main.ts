import express from 'express';
import type { Request, Response } from 'express';
import bodyParser from 'body-parser';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import type { Database } from 'sqlite';

const app = express();
app.use(bodyParser.json());

let database: Database;

async function initializeServer() {
    database = await open({
        filename: './database.sqlite',
        driver: sqlite3.Database
    });

    await database.exec(`
        CREATE TABLE IF NOT EXISTS Contact (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            phoneNumber TEXT,
            email TEXT,
            linkedId INTEGER,
            linkPrecedence TEXT CHECK(linkPrecedence IN ('primary', 'secondary')),
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            deletedAt DATETIME
        )
    `);
}

app.post('/identify', async (req: Request, res: Response) => {
    try {
        const { email, phoneNumber } = req.body;
        const phone = phoneNumber ? String(phoneNumber) : null;

        if (!email && !phone) {
            return res.status(400).json({ error: "Please provide an email or phone number." });
        }

        const existingRecords = await database.all(
            'SELECT * FROM Contact WHERE email = ? OR phoneNumber = ?',
            [email, phone]
        );

        if (existingRecords.length === 0) {
            const newUser = await database.run(
                'INSERT INTO Contact (email, phoneNumber, linkPrecedence) VALUES (?, ?, ?)',
                [email, phone, 'primary']
            );
            return res.status(200).json({
                contact: {
                    primaryContatctId: newUser.lastID,
                    emails: [email].filter(Boolean),
                    phoneNumbers: [phone].filter(Boolean),
                    secondaryContactIds: []
                }
            });
        }

        let relatedIds = new Set<number>();
        existingRecords.forEach(r => relatedIds.add(r.linkedId || r.id));

        const idList = Array.from(relatedIds).join(',');
        const allLinkedContacts = await database.all(
            `SELECT * FROM Contact WHERE id IN (${idList}) OR linkedId IN (${idList})`
        );

        const sorted = allLinkedContacts.sort((a, b) => 
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );
        
        const primaryAccount = sorted[0];
        const others = sorted.slice(1);

        for (let contact of others) {
            if (contact.linkPrecedence === 'primary') {
                await database.run(
                    'UPDATE Contact SET linkPrecedence = "secondary", linkedId = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?',
                    [primaryAccount.id, contact.id]
                );
            }
        }

        const emailIsNew = email && !allLinkedContacts.some(c => c.email === email);
        const phoneIsNew = phone && !allLinkedContacts.some(c => c.phoneNumber === phone);

        if (emailIsNew || phoneIsNew) {
            const newEntry = await database.run(
                'INSERT INTO Contact (email, phoneNumber, linkedId, linkPrecedence) VALUES (?, ?, ?, ?)',
                [email, phone, primaryAccount.id, 'secondary']
            );
            const newlyAdded = await database.get('SELECT * FROM Contact WHERE id = ?', [newEntry.lastID]);
            allLinkedContacts.push(newlyAdded);
        }

        const finalEmails = Array.from(new Set([primaryAccount.email, ...allLinkedContacts.map(c => c.email)])).filter(Boolean);
        const finalPhones = Array.from(new Set([primaryAccount.phoneNumber, ...allLinkedContacts.map(c => c.phoneNumber)])).filter(Boolean);
        const secondaryIds = allLinkedContacts.filter(c => c.id !== primaryAccount.id).map(c => c.id);

        return res.status(200).json({
            contact: {
                primaryContatctId: primaryAccount.id,
                emails: finalEmails,
                phoneNumbers: finalPhones,
                secondaryContactIds: Array.from(new Set(secondaryIds))
            }
        });

    } catch (err) {
        console.error("Internal Error:", err);
        return res.status(500).json({ error: "Internal server error." });
    }
});

const APP_PORT = process.env.PORT || 3000;

initializeServer().then(() => {
    app.listen(Number(APP_PORT), '0.0.0.0', () => {
        console.log(`FluxLink_Core Engine active on port ${APP_PORT}`);
    });
});
