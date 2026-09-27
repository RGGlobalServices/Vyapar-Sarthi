import WorkflowConfigModule from '@/components/settings/WorkflowConfigModule';

export const metadata = {
  title: 'Workflow Configuration - Vyapar Sarthi'
};

export default function WorkflowsPage() {
  return (
    <div className="h-full bg-slate-50/50">
      <WorkflowConfigModule />
    </div>
  );
}
