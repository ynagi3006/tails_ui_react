import { ConstructionIcon } from 'lucide-react'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

type PlaceholderPageProps = {
  title: string
  description?: string
}

export function PlaceholderPage({ title, description }: PlaceholderPageProps) {
  return (
    <div className="mx-auto max-w-lg py-6 sm:py-10">
      <Card className="border-border/70 rounded-2xl shadow-sm">
        <CardHeader className="space-y-4">
          <div className="bg-muted/50 text-muted-foreground flex size-12 items-center justify-center rounded-2xl">
            <ConstructionIcon className="size-6" aria-hidden />
          </div>
          <div className="space-y-1">
            <CardTitle className="text-xl tracking-tight">{title}</CardTitle>
            {description ? <CardDescription className="text-sm leading-relaxed">{description}</CardDescription> : null}
          </div>
        </CardHeader>
        <CardContent className="text-muted-foreground border-border/50 border-t pt-6 text-sm">
          Not available in this UI yet.
        </CardContent>
      </Card>
    </div>
  )
}
