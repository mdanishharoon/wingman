import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(req: NextRequest) {
    // Always permit the /api/cron endpoint as it handles its own Bearer token authentication
    if (req.nextUrl.pathname.startsWith('/api/cron')) {
        return NextResponse.next();
    }

    const authHeader = req.headers.get('authorization');

    if (authHeader && authHeader.startsWith('Basic ')) {
        const authValue = authHeader.split(' ')[1];
        const [user, pwd] = atob(authValue).split(':');

        // Default basic auth credentials requested by the user
        // In the future, these can be overridden with environment variables
        const validUser = process.env.BASIC_AUTH_USER || 'dan';
        const validPass = process.env.BASIC_AUTH_PASSWORD || '@vyro1';

        if (user === validUser && pwd === validPass) {
            return NextResponse.next();
        }
    }

    // If no valid auth header exists, prompt the browser for Basic Auth
    return new NextResponse('Authentication required', {
        status: 401,
        headers: {
            'WWW-Authenticate': 'Basic realm="Wingman Secure Area"',
        },
    });
}

export const config = {
    // Protect all application routes except static files/images
    matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
