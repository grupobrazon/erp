// Gerado de base44/functions/restoreFromBackup/entry.ts por tools/port_function.py.
// Para mudar regra de negócio, altere o original e gere de novo.
import { createClientFromRequest } from "../b44.ts";

const ALL_ENTITIES = [
  "Client", "Address", "Contact",
  "Product", "ProductGroup", "ProductSubgroup", "StockUnit", "SupplySource", "ProductTypeOption",
  "Equipment",
  "Sale", "StockMovement",
  "Maintenance", "ServiceOrder"
];

export default (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Apenas administradores podem restaurar backups' }, { status: 403 });

    const body = await req.json();
    const backupId = body.backup_id;
    const entityNames = body.entity_names; // array of entity names to restore
    const replace = body.replace !== false; // default true — delete current then re-create

    if (!backupId) return Response.json({ error: 'backup_id é obrigatório' }, { status: 400 });

    const backup = await base44.asServiceRole.entities.Backup.get(backupId);
    if (!backup) return Response.json({ error: 'Backup não encontrado' }, { status: 404 });

    const response = await fetch(backup.file_url);
    const backupData = await response.json();

    const entitiesToRestore = (entityNames && entityNames.length > 0) ? entityNames : ALL_ENTITIES;
    const result = {};

    for (const entName of entitiesToRestore) {
      const records = (backupData.entities && backupData.entities[entName]) || [];
      if (records.length === 0) {
        result[entName] = { restored: 0, skipped: true };
        continue;
      }

      // Strip system-generated fields so new records get fresh IDs
      const cleanRecords = records.map(r => {
        const { id, created_date, updated_date, created_by_id, ...rest } = r;
        return rest;
      });

      if (replace) {
        await base44.asServiceRole.entities[entName].deleteMany({});
      }

      // Bulk create in chunks of 400
      let restored = 0;
      for (let i = 0; i < cleanRecords.length; i += 400) {
        const chunk = cleanRecords.slice(i, i + 400);
        await base44.asServiceRole.entities[entName].bulkCreate(chunk);
        restored += chunk.length;
      }
      result[entName] = { restored };
    }

    return Response.json({ success: true, result });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});