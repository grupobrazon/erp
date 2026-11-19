// Gerado de base44/functions/createDatabaseBackup/entry.ts por tools/port_function.py.
// Para mudar regra de negócio, altere o original e gere de novo.
import { createClientFromRequest } from "../b44.ts";

const ENTITIES_TO_BACKUP = [
  "Client", "Address", "Contact",
  "Product", "ProductGroup", "ProductSubgroup", "StockUnit", "SupplySource", "ProductTypeOption",
  "Equipment",
  "Sale", "StockMovement",
  "Maintenance", "ServiceOrder"
];

export default (async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Auth: admin if called from UI; service-role if scheduled (no user session)
    let backupType = "Automatico";
    try {
      const user = await base44.auth.me();
      if (user) {
        if (user.role !== 'admin') {
          return Response.json({ error: 'Apenas administradores podem criar backups' }, { status: 403 });
        }
        backupType = "Manual";
      }
    } catch (_) {
      // No user context — scheduled automation, proceed as service role
    }

    const backupEntities = {};
    const summary = {};
    for (const entityName of ENTITIES_TO_BACKUP) {
      const records = await base44.asServiceRole.entities[entityName].list("-created_date", 10000);
      backupEntities[entityName] = records;
      summary[entityName] = records.length;
    }

    const dateStr = new Date().toISOString();
    const json = JSON.stringify({ date: dateStr, entities: backupEntities });
    const blob = new Blob([json], { type: 'application/json' });
    const file = new File([blob], `backup-${dateStr.slice(0, 10)}.json`, { type: 'application/json' });
    const uploadResult = await base44.asServiceRole.integrations.Core.UploadFile({ file });
    const fileUrl = uploadResult.file_url;

    const totalRecords = Object.values(summary).reduce((a, b) => a + (b as number), 0);
    await base44.asServiceRole.entities.Backup.create({
      date: dateStr,
      file_url: fileUrl,
      summary: JSON.stringify(summary),
      total_records: totalRecords,
      type: backupType
    });

    // Auto-delete backups older than 30 days
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const oldBackups = await base44.asServiceRole.entities.Backup.filter({});
    const toDelete = oldBackups.filter(b => b.date < cutoff).map(b => b.id);
    if (toDelete.length > 0) {
      await base44.asServiceRole.entities.Backup.deleteMany({ id: { $in: toDelete } });
    }

    return Response.json({ success: true, summary, total_records: totalRecords, type: backupType });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});