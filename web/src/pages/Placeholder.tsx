import { Card, EmptyState, PageHeader } from '../components/ui'

export function Placeholder({ title, phase }: { title: string; phase: number }) {
  return (
    <>
      <PageHeader title={title} />
      <Card>
        <EmptyState title="Pantalla en construcción" text={`Esta pantalla se reconstruye en la Fase ${phase}. Mientras tanto sigue disponible en el sitio actual.`} />
      </Card>
    </>
  )
}
