# Mnemo

Mnemo is a Next.js study app that turns uploaded documents into:

- flashcards
- mixed quiz questions
- concept graphs
- workbench study activities
- nursing-specific NCLEX practice or engineering-focused problem sets

## What You Need

Before you can run the app locally, you need:

- a computer with Windows, macOS, or Linux
- internet access for the initial setup
- a Supabase project
- a Groq API key

## Fast Setup For Non-Technical Users

If you do not have Git or Node installed yet, follow this version first.

### 1. Install Node.js

1. Go to [https://nodejs.org](https://nodejs.org)
2. Download the current LTS version
3. Run the installer
4. Accept the default options

After installation, open a new terminal and check that it worked:

```bash
node -v
npm -v
```

You should see version numbers for both commands.

### 2. Download the Project

If you do not use Git:

1. Open the project page in your browser
2. Download the project as a `.zip`
3. Extract it somewhere easy to find, such as your Desktop or Documents folder

If Git is already installed, you can clone it instead:

```bash
git clone <repo-url>
cd Mnemo
```

### 3. Open the Project Folder in a Terminal

On Windows:

1. Open the project folder in File Explorer
2. Click the address bar
3. Type `powershell`
4. Press Enter

On macOS:

1. Open Terminal
2. Type `cd `
3. Drag the project folder into the Terminal window
4. Press Enter

### 4. Install the App Dependencies

Run:

```bash
npm install
```

This may take a minute or two.

### 5. Create Your Environment File

Create a file named `.env` in the project root and add your keys:

```env
GROQ_API_KEY=your_groq_key_here
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key_optional_but_recommended
ELEVENLABS_API_KEY=your_elevenlabs_key_optional
HUDSON_WILLIAMS=voice_id_optional
MALE=voice_id_optional
WOMAN=voice_id_optional
```

Notes:

- `GROQ_API_KEY` is required for content generation
- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are required
- `SUPABASE_SERVICE_ROLE_KEY` is recommended for server-side admin operations
- ElevenLabs keys are only needed if you want text-to-speech or speech-to-text features

### 6. Run the Database Setup

Open your Supabase project and run the SQL migrations in order:

1. [001_initial_schema.sql](/c:/Users/thech/Downloads/Dev/Mnemo/supabase/migrations/001_initial_schema.sql)
2. [002_add_features.sql](/c:/Users/thech/Downloads/Dev/Mnemo/supabase/migrations/002_add_features.sql)
3. [003_add_concept_graph.sql](/c:/Users/thech/Downloads/Dev/Mnemo/supabase/migrations/003_add_concept_graph.sql)
4. [004_add_document_content.sql](/c:/Users/thech/Downloads/Dev/Mnemo/supabase/migrations/004_add_document_content.sql)
5. [005_add_chat_conversations.sql](/c:/Users/thech/Downloads/Dev/Mnemo/supabase/migrations/005_add_chat_conversations.sql)
6. [006_add_workbench.sql](/c:/Users/thech/Downloads/Dev/Mnemo/supabase/migrations/006_add_workbench.sql)
7. [007_add_study_modes_and_specialized_questions.sql](/c:/Users/thech/Downloads/Dev/Mnemo/supabase/migrations/007_add_study_modes_and_specialized_questions.sql)
8. [008_add_workbench_glossary.sql](/c:/Users/thech/Downloads/Dev/Mnemo/supabase/migrations/008_add_workbench_glossary.sql)

If you are not using the Supabase CLI, you can copy each file into the Supabase SQL Editor and run them one by one.

### 7. Start the App

Run:

```bash
npm run dev
```

Then open:

```text
http://localhost:3000
```

## Developer Setup

If you already have Git and Node installed:

```bash
git clone <repo-url>
cd Mnemo
npm install
```

Create `.env` with the required keys:

```env
GROQ_API_KEY=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ELEVENLABS_API_KEY=
HUDSON_WILLIAMS=
MALE=
WOMAN=
```

Run the SQL migrations in `supabase/migrations`, then start the app:

```bash
npm run dev
```

## Useful Commands

Start the development server:

```bash
npm run dev
```

Create a production build:

```bash
npm run build
```

Start the production server after building:

```bash
npm run start
```

Run linting:

```bash
npm run lint
```

## Troubleshooting

### `node` or `npm` is not recognized

Node.js is not installed yet, or your terminal was open before installation finished.

Try:

1. close the terminal
2. reopen it
3. run `node -v`

If it still fails, reinstall Node.js from [https://nodejs.org](https://nodejs.org).

### `git` is not recognized

You can still use the app by downloading the repository as a `.zip` instead of cloning it.

### The app starts but uploads fail

Check that:

- your `.env` file exists in the project root
- your Groq key is valid
- your Supabase URL and keys are correct
- your Supabase SQL migrations were all run successfully

### Workbench or quiz errors mention missing columns

That usually means one or more Supabase migrations were not applied yet. Run the SQL files in `supabase/migrations` in order.

## Tech Stack

- Next.js 16
- React 19
- TypeScript
- Supabase
- Groq
- ElevenLabs
