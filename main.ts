import express from 'express';
import type { Request, Response } from 'express';
import bodyParser from 'body-parser';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import type { Database } from 'sqlite';

const app = express();
app.use(bodyParser.json());

let database: Database;

// Initialize connection to our SQLite file
async function initializeServer() {
    database = await open({
        filename: './database.sqlite',
        driver: sqlite3.Database
    });

    // Create the table if it's our first time running the app
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

        // Validation: We need at least one piece of contact info
        if (!email && !phone) {
            return res.status(400).json({ error: "Please provide an email or phone number." });
        }

        // Search for any existing records that share this email or phone
        const existingRecords = await database.all(
            'SELECT * FROM Contact WHERE email = ? OR phoneNumber = ?',
            [email, phone]
        );

        // Case 1: No match found? Create a new primary user.
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

        // Case 2: We found matches. Now we find the "root" (oldest) primary ID.
        let relatedIds = new Set<number>();
        existingRecords.forEach(r => relatedIds.add(r.linkedId || r.id));

        // Get the full list of all connected contacts
        const idList = Array.from(relatedIds).join(',');
        const allLinkedContacts = await database.all(
            `SELECT * FROM Contact WHERE id IN (${idList}) OR linkedId IN (${idList})`
        );

        // Sort by date so we always treat the oldest as the Primary
        const sorted = allLinkedContacts.sort((a, b) => 
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );
        
        const primaryAccount = sorted[0];
        const others = sorted.slice(1);

        // Update any other 'primary' accounts to 'secondary' if they are now linked
        for (let contact of others) {
            if (contact.linkPrecedence === 'primary') {
                await database.run(
                    'UPDATE Contact SET linkPrecedence = "secondary", linkedId = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?',
                    [primaryAccount.id, contact.id]
                );
            }
        }

        // Check if the current request brings any NEW information we don't have yet
        const emailIsNew = email && !allLinkedContacts.some(c => c.email === email);
        const phoneIsNew = phone && !allLinkedContacts.some(c => c.phoneNumber === phone);

        if (emailIsNew || phoneIsNew) {
            const newEntry = await database.run(
                'INSERT INTO Contact (email, phoneNumber, linkedId, linkPrecedence) VALUES (?, ?, ?, ?)',
                [email, phone, primaryAccount.id, 'secondary']
            );
            // Refresh our local list to include the new entry
            const newlyAdded = await database.get('SELECT * FROM Contact WHERE id = ?', [newEntry.lastID]);
            allLinkedContacts.push(newlyAdded);
        }

        // Final step: Gather all unique emails and phones for the response
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
        return res.status(500).json({ error: "Something went wrong on our end." });
    }
});

// Set the port and launch
const APP_PORT = 3000;
initializeServer().then(() => {
    app.listen(APP_PORT, () => {
        console.log(`Identity Service is now running on port ${APP_PORT}`);
    });
});