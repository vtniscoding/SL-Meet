import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://pqifniaqevfeastebouf.supabase.co';
const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_jAWSbqm7AgMJ2CbXMDVl9w_lE6DgWO2';

const supabase = createClient(supabaseUrl, supabaseKey);

async function migrate() {
  console.log('--- Starting ASL Dataset Migration to Supabase ---');
  const datasetPath = path.join(__dirname, '../server/data/asl_dataset.json');

  if (!fs.existsSync(datasetPath)) {
    console.error('Dataset file not found at:', datasetPath);
    process.exit(1);
  }

  const raw = fs.readFileSync(datasetPath, 'utf8');
  const data = JSON.parse(raw);
  const gestures = data.gestures || [];

  console.log(`Found ${gestures.length} samples in local JSON file.`);

  // Check existing samples in Supabase
  const { data: existing, error: checkError } = await supabase
    .from('asl_gestures')
    .select('id, name');

  if (checkError) {
    console.error('Error querying asl_gestures:', checkError);
    process.exit(1);
  }

  console.log(`Currently ${existing?.length || 0} samples exist in Supabase.`);

  let insertedCount = 0;
  for (const g of gestures) {
    const payload = {
      name: g.name,
      type: g.type || (g.vector?.length > 63 ? 'two_hands' : 'single_hand'),
      category: g.vector?.length > 63 ? 'compound_greeting' : 'alphabet',
      vector: g.vector,
      description: g.description || `Sample ${g.id || ''}`,
      metadata: {
        legacy_id: g.id,
        dimension: g.vector?.length || 0,
      },
    };

    const { error: insertError } = await supabase
      .from('asl_gestures')
      .insert(payload);

    if (insertError) {
      console.error(`Failed to insert sample "${g.name}":`, insertError);
    } else {
      insertedCount++;
    }
  }

  console.log(`✅ Successfully migrated ${insertedCount} samples to Supabase "asl_gestures" table!`);
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
