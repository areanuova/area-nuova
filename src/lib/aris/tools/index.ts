import { registry } from '../agent/registry';
import { AlloggiTool } from './alloggi-tool';
import { GuideTool } from './guide-tool';
import { ConvenzioniTool } from './convenzioni-tool';
import { WhatsAppTool } from './whatsapp-tool';
import { NewsTool } from './news-tool';
import { RegolamentiTool } from './regolamenti-tool';
import { RappresentantiTool } from './rappresentanti-tool';
import { ExternalOfficialSourcesTool } from './external-official-sources-tool';
import { IdentityTool } from './identity-tool';
import { RagTool } from './rag-tool';

// Registration order doesn't matter — the planner sorts by priority.
// Adding a new tool requires only: create its file and add one line here.
registry.register(new AlloggiTool());
registry.register(new GuideTool());
registry.register(new ConvenzioniTool());
registry.register(new WhatsAppTool());
registry.register(new NewsTool());
registry.register(new RegolamentiTool());
registry.register(new RappresentantiTool());
registry.register(new ExternalOfficialSourcesTool());
registry.register(new IdentityTool());
registry.register(new RagTool());
