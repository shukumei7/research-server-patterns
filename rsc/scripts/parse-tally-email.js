/**
 * Parses a Tally form notification email body into a structured object.
 *
 * Tally email format:
 *   New submission for "Form Name"
 *
 *   Field Label
 *   Field Value
 *
 *   Next Label
 *   Next Value
 */
function parseTallyEmail(emailBody) {
  const lines = emailBody.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);

  const formNameMatch = lines[0]?.match(/New submission for "(.+)"/);
  const formName = formNameMatch ? formNameMatch[1] : 'Unknown Form';

  // Known labels from both RSP Tally forms
  const knownLabels = new Set([
    'Your name', 'Business name', 'What does your business do?',
    'Primary email address', 'Timezone', 'Agent email address',
    'Hosting target', 'What is your hosting target?',
    'Hostname or IP address', 'SSH username', 'SSH port',
    'Is Node.js 18+ installed?', 'Preferred install path',
    'Which accounts to connect?',
    "What's your main goal in one sentence?",
    'Project 1 name', 'Project 1 — path on your machine',
    'Project 1 — one-sentence description', 'Project 1 — GitHub repo, if any',
    'Project 2 name', 'Project 2 — path on your machine',
    'Project 2 — one-sentence description',
    'Project 3 name', 'Project 3 — path on your machine',
    'Project 3 — one-sentence description',
    'Mailbox 1 label', 'Mailbox 1 email address',
    'Mailbox 1 IMAP host', 'Mailbox 1 SMTP host', 'Mailbox 1 auth type',
    'Mailbox 1 — should this be the primary outbound mailbox?',
    'Mailbox 2 label', 'Mailbox 2 email address',
    'Mailbox 2 IMAP host', 'Mailbox 2 SMTP host', 'Mailbox 2 auth type',
    'Should Claude send you a daily morning briefing email?',
    'Do you have R&D work that may qualify for Canadian SR&ED tax credits?',
    'Any other scheduled tasks you want? Describe them.',
    'What email triggers do you want configured?',
    'Do you have a Claude.ai Pro subscription (or higher)?',
    'GitHub org or username, if connecting GitHub',
    'How should Claude write in emails?',
    'What should Claude always ask you before doing?',
    'What can Claude do without asking?',
    'Anything else we should know?',
  ]);

  const fields = {};
  for (let i = 0; i < lines.length; i++) {
    if (knownLabels.has(lines[i]) && i + 1 < lines.length) {
      const value = lines[i + 1];
      if (!knownLabels.has(value)) {
        fields[lines[i]] = value;
        i++;
      }
    }
  }

  // Extract respondent email from fields or dedicated line
  const respondentEmail =
    fields['Primary email address'] ||
    fields['Your email'] ||
    lines.find(l => l.includes('@') && !l.includes('tally.so')) ||
    null;

  return { formName, respondentEmail, fields };
}

module.exports = { parseTallyEmail };

// CLI: echo "email body" | node parse-tally-email.js
if (require.main === module) {
  let body = '';
  process.stdin.on('data', d => { body += d; });
  process.stdin.on('end', () => {
    console.log(JSON.stringify(parseTallyEmail(body), null, 2));
  });
}
