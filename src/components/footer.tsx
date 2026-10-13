import { Link } from "react-router-dom"

export function Footer() {
    return (
        <footer className="border-t border-gray-800 bg-black text-white py-8 px-6 md:px-12">
            <div className="max-w-7xl mx-auto">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    {/* Brand Section */}
                    <div className="space-y-3">
                        <div className="flex items-center gap-2">
                            <img src="/aze-removebg-preview.png" alt="Athena AI Logo" className="h-8 w-8 object-contain" />
                            <div className="flex flex-col">
                                <span className="font-bold">Athena AI</span>
                                <span className="text-xs text-gray-400">Study Smarter, Not Harder</span>
                            </div>
                        </div>
                        <p className="text-sm text-gray-400">
                            Your personal AI learning companion for smarter studying.
                        </p>
                    </div>

                    {/* Quick Links */}
                    <div className="space-y-3">
                        <h3 className="font-semibold text-sm uppercase tracking-wider">Quick Links</h3>
                        <nav className="flex flex-col space-y-2">
                            <Link to="/" className="text-sm text-gray-400 hover:text-blue-400 transition">
                                Home
                            </Link>
                            <Link to="/about" className="text-sm text-gray-400 hover:text-blue-400 transition">
                                About
                            </Link>
                            <Link to="/chat" className="text-sm text-gray-400 hover:text-blue-400 transition">
                                Chat
                            </Link>
                            <Link to="/contact" className="text-sm text-gray-400 hover:text-blue-400 transition">
                                Contact
                            </Link>
                        </nav>
                    </div>

                    {/* Contact Info */}
                    <div className="space-y-3">
                        <h3 className="font-semibold text-sm uppercase tracking-wider">Get in Touch</h3>
                        <div className="space-y-2">
                            <p className="text-sm text-gray-400">
                                📧 support@athenaai.com
                            </p>
                            <p className="text-sm text-gray-400">
                                🌐 Follow us on social media
                            </p>
                        </div>
                    </div>
                </div>

                {/* Copyright */}
                <div className="mt-8 pt-6 border-t border-gray-800 text-center">
                    <p className="text-sm text-gray-500">
                        © {new Date().getFullYear()} Athena AI. All rights reserved.
                    </p>
                </div>
            </div>
        </footer>
    )
}
