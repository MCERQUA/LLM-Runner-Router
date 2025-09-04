import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('Loading LLM Router...');

// Load the registry
const projectRoot = path.resolve(__dirname, '..', '..');
const registryPath = path.join(projectRoot, 'models', 'registry.json');
if (fs.existsSync(registryPath)) {
    const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    console.log('\n📚 Registered Models:');
    registry.models.forEach(model => {
        console.log(`\n  ${model.id}:`);
        console.log(`    Name: ${model.name}`);
        console.log(`    Format: ${model.format}`);
        console.log(`    Size: ${model.parameters.size}`);
        console.log(`    Path: ${model.path || model.source}`);

        // Check if model file exists
        const modelPath = path.join(projectRoot, 'models', model.path || model.source || '');
        const exists = fs.existsSync(modelPath);
        console.log(`    Status: ${exists ? '✅ Available' : '❌ Not found'}`);
    });
    
    console.log(`\n🎯 Default Model: ${registry.defaultModel}`);
} else {
    console.log('❌ No registry found');
}

// Try to load the main router
try {
    const { LLMRouter } = await import('./src/index.js');
    console.log('\n✅ LLMRouter loaded successfully');
    
    // Test basic initialization
    const router = new LLMRouter({
        autoInit: false,
        strategy: 'balanced'
    });
    
    console.log('✅ Router initialized');
    
    // Try to register models from registry
    if (fs.existsSync(registryPath)) {
        const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
        console.log('\n🔄 Registering models...');
        
        for (const model of registry.models) {
            try {
                await router.registry.register(model);
                console.log(`  ✅ Registered: ${model.id}`);
            } catch (err) {
                console.log(`  ⚠️  Failed to register ${model.id}: ${err.message}`);
            }
        }
    }
    
} catch (err) {
    console.log(`\n⚠️  Router initialization warning: ${err.message}`);
    console.log('This is expected if models are not fully configured yet.');
}

console.log('\n✅ Model test complete!');
