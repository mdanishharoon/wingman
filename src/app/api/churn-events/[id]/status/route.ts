import { NextResponse } from 'next/server';
import { supabase } from '../../../../../lib/supabase';

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        const { status } = await req.json();

        if (!id || typeof id !== 'string') {
            return NextResponse.json({ error: 'Missing or invalid event ID' }, { status: 400 });
        }

        if (!['pending', 'skipped', 'contacted'].includes(status)) {
            return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
        }

        const { data, error } = await supabase
            .from('churn_events')
            .update({ status })
            .eq('id', id)
            .select()
            .single();

        if (error) {
            console.error('Error updating status:', error);
            return NextResponse.json({ error: 'Failed to update status' }, { status: 500 });
        }

        return NextResponse.json({ success: true, event: data });
    } catch (error: any) {
        console.error('Error in /api/churn-events/[id]/status:', error);
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
    }
}
