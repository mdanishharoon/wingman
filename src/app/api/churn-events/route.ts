import { NextResponse } from 'next/server';
import { supabase } from '../../../lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const { data, error } = await supabase
            .from('churn_events')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) {
            console.error(error);
            return new NextResponse('Internal Server Error', { status: 500 });
        }

        return NextResponse.json(data);
    } catch (err) {
        console.error(err);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}
